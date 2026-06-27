/**
 * 원본 .pptx → 마스킹 템플릿(assets/ppt-template.pptx) 빌드.
 *
 * ⚠️ 입력(원본)은 레포 외부 로컬 파일(커밋 금지). 출력 템플릿은 **실수치·실명 0** —
 *    모든 표의 데이터 셀(숫자/비율/통화)과 책임자명 셀을 빈 문자열로 비운다.
 *    (헌장 4: 로컬·마스킹. 슬라이드 구조·서식·헤더 라벨은 100% 보존 → 런타임에 값만 주입.)
 *
 * 마스킹 규칙(전 슬라이드 표):
 *   - 셀 텍스트가 "데이터 값"(숫자·콤마·소수·%·통화·날짜·음수)이면 → "" 로 비움.
 *   - 슬라이드1 책임자 위치(r03 이름들 + 데이터행 c01)도 → "" (한글 실명 → 패턴 미포착분 명시 제거).
 *   헤더·구조 라벨(전체·SS시즌·여성·물류비·금액 등 비숫자 한글)은 보존.
 *
 * 실행: npx tsx scripts/build-pptx-template.ts [원본경로]
 *   기본 원본 = OPR_DATA_DIR 또는 문서상 기본 폴더의 #유통물류_OPR모니터링_*.pptx
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { unzipSync, zipSync } from "fflate";

import { findTableRanges, getCellText, setCellText } from "@/lib/pptx/table-xml";

const DEFAULT_DIR =
  process.env.OPR_DATA_DIR ?? "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";

/** 로컬 실명 denylist(커밋 금지). 빈 파일/부재 시 이름 마스킹은 슬라이드1 위치 규칙만 적용. */
function loadNameDenylist(): string[] {
  const p = path.resolve(process.cwd(), "scripts/.mask-names.local.txt");
  if (!existsSync(p)) {
    console.warn(
      "[template] ⚠️ scripts/.mask-names.local.txt 없음 — 표 외 실명 마스킹 생략(슬라이드 2~5 PII 잔존 위험). 로컬 denylist 생성 권장.",
    );
    return [];
  }
  return readFileSync(p, "utf-8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 데이터 값 판정: 숫자·콤마·소수·%·통화·날짜·음수·괄호숫자·단위숫자(공백 트림 후). */
function isDataValue(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // 순수 숫자/콤마/소수/퍼센트/음수/통화기호
  if (/^[-+]?[\d.,]+%?$/.test(t)) return true;
  if (/^[₩$]\s*[\d.,]+$/.test(t)) return true;
  // 날짜: 2026-06-22 / 4/29 / 5./11 / 6.12 등(연도 유무 무관, 구분자 . / - 연속 허용 "5./11").
  if (/^\d{1,4}\s*[-./]+\s*\d{1,2}(\s*[-./]+\s*\d{1,2})?$/.test(t)) return true;
  // 괄호 숫자(마이너스재고·수량 표기): (n,nnn) / (-n,nnn) / ( nn )
  if (/^\(\s*[-+]?[\d.,]+\s*\)$/.test(t)) return true;
  // 단위 숫자: 21sku / 4SKU / 1300장 / 197SKU 등(숫자+짧은 단위).
  if (/^[\d,]+\s*(sku|장|개|p|pcs|ea)?$/i.test(t)) return true;
  return false;
}

/**
 * 자유서술(비고·조치) 위치 — 슬라이드별 텍스트 코멘트 열(0-base).
 * 실데이터(영업 코멘트·점포·SKU·금액 서술)라 위치 기반으로 마스킹(개별 토큰 마스킹의 보완).
 *   슬3·4: c20(비고 사항) · 슬5: c29(조치/비고). 데이터행에서만.
 */
function isFreeTextPosition(slideIndex: number, row: number, col: number): boolean {
  if ((slideIndex === 3 || slideIndex === 4) && row >= 2 && col === 20) return true;
  if (slideIndex === 5 && row >= 4 && col === 29) return true;
  return false;
}

/** 슬라이드1 책임자명 위치(0-base): r03 c01/c07/c11/c15/c22 + 데이터행 c01. */
function isNamePositionSlide1(row: number, col: number): boolean {
  if (row === 3) return [1, 7, 11, 15, 22].includes(col);
  // 데이터 블록 c01(어느영역 책임자명 — 실명은 denylist/위치 규칙으로 마스킹)
  if (row >= 4 && col === 1) return true;
  return false;
}

/**
 * 표 밖(텍스트박스·도형 등) 포함 전 슬라이드에서 denylist 실명을 담은 <a:t> 런을 빈칸으로.
 * 토큰 부분일치(슬래시 결합 셀 포함). 구조 라벨엔 실명이 없으므로 부수효과 적음.
 */
function maskNamesEverywhere(xml: string, names: string[]): { xml: string; cleared: number } {
  if (names.length === 0) return { xml, cleared: 0 };
  let cleared = 0;
  const out = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (full, inner: string) => {
    const text = inner;
    if (names.some((n) => text.includes(n))) {
      cleared++;
      return "<a:t></a:t>";
    }
    return full;
  });
  return { xml: out, cleared };
}

function maskSlideXml(
  xml: string,
  slideIndex: number,
  names: string[],
): { xml: string; cleared: number } {
  // 표가 없을 수 있음 → 안전 처리.
  let cleared = 0;
  let cur = xml;
  // (1) 표 외 실명 마스킹(전 도형).
  const nameMask = maskNamesEverywhere(cur, names);
  cur = nameMask.xml;
  cleared += nameMask.cleared;
  // 표가 여러 개여도 첫 표만 데이터 표(실측). 안전상 첫 표만 처리.
  let t;
  try {
    t = findTableRanges(cur);
  } catch {
    return { xml: cur, cleared: 0 };
  }
  for (let r = 0; r < t.rows.length; r++) {
    for (let c = 0; c < t.rows[r]!.cells.length; c++) {
      const txt = getCellText(cur, t, r, c);
      const isName = slideIndex === 1 && isNamePositionSlide1(r, c);
      const isFreeText = isFreeTextPosition(slideIndex, r, c);
      // freeText 위치는 첫 런이 비어도(멀티런 분할) 무조건 전체 비움 — 데이터값/실명은 첫 런 기준.
      const shouldClear = isFreeText || (!!txt && (isDataValue(txt) || isName));
      if (shouldClear) {
        // clearOtherRuns(기본 true): 멀티런으로 쪼개진 데이터/서술 전체를 비운다(잔존 방지).
        cur = setCellText(cur, t, r, c, "", { skipIfNoRun: true });
        cleared++;
        // 좌표 변동 → 재파싱(빈 문자열이라 길이 줄어듦).
        t = findTableRanges(cur);
      }
    }
  }
  // (3) 멀티런 셀에서 쪼개진 숫자 조각(예 "3","."): 개별 <a:t> 가 순수 데이터값이면 비움.
  const fragMask = cur.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (full, inner: string) => {
    if (isDataValue(inner)) {
      cleared++;
      return "<a:t></a:t>";
    }
    return full;
  });
  cur = fragMask;

  // (4) 표 밖(요약 텍스트박스 등) 런 중 "숫자를 포함한" 런을 비운다(요약 코멘트 실수치 잔존 방지).
  //     표 안 헤더 구조 라벨은 비숫자 한글이라 미영향. 표 밖은 자유서술이라 숫자=실데이터.
  try {
    const tt = findTableRanges(cur);
    const before = cur.slice(0, tt.tblStart);
    const tblPart = cur.slice(tt.tblStart, tt.tblEnd);
    const after = cur.slice(tt.tblEnd);
    const maskOutside = (s: string): string =>
      s.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (full, inner: string) => {
        // 숫자 2자리+ 또는 괄호숫자/날짜 포함 런 = 요약 실수치 단편 → 비움.
        if (/\d{2,}/.test(inner) || /\(\s*[-+]?\d/.test(inner) || /\d\s*[/.~-]\s*\d/.test(inner)) {
          cleared++;
          return "<a:t></a:t>";
        }
        return full;
      });
    cur = maskOutside(before) + tblPart + maskOutside(after);
  } catch {
    // 표가 없으면 전체가 표 밖 — 위 fragMask 로 충분(추가 처리 생략).
  }

  return { xml: cur, cleared };
}

function findOriginal(dir: string): string {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pptx") && f.includes("OPR"));
  if (files.length === 0) throw new Error(`원본 .pptx 를 찾을 수 없습니다: ${dir}`);
  // 가장 최근(파일명 정렬) — 모니터링 보고서.
  files.sort();
  return path.join(dir, files[files.length - 1]!);
}

function main() {
  const srcArg = process.argv[2];
  const src = srcArg ?? findOriginal(DEFAULT_DIR);
  console.log(`[template] 원본: ${src}`);

  const buf = readFileSync(src);
  const files = unzipSync(new Uint8Array(buf));
  const dec = new TextDecoder("utf-8");
  const enc = new TextEncoder();
  const names = loadNameDenylist();
  console.log(`[template] 실명 denylist: ${names.length}개`);

  let totalCleared = 0;
  for (const name of Object.keys(files)) {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
    if (!m) continue;
    const slideIndex = Number(m[1]);
    const xml = dec.decode(files[name]!);
    const { xml: masked, cleared } = maskSlideXml(xml, slideIndex, names);
    files[name] = enc.encode(masked);
    totalCleared += cleared;
    console.log(`[template] slide${slideIndex}: 데이터/이름 셀 ${cleared}개 비움`);
  }

  const out = zipSync(files, { level: 6 });
  const outDir = path.resolve(process.cwd(), "assets");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "ppt-template.pptx");
  writeFileSync(outPath, out);
  console.log(`[template] 출력: ${outPath} (총 ${totalCleared}셀 마스킹)`);
}

main();
