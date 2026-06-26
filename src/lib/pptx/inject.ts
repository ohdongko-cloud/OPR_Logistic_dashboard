/**
 * PPTX 템플릿 주입 — 마스킹 템플릿(.pptx) + 엔진 칸반 → 값 채운 .pptx 바이트.
 *
 * 방식(노드 런타임, Vercel 호환): fflate 로 unzip → slide1.xml 표 셀의 첫 <a:t> 텍스트만
 *   엔진 집계값으로 치환(서식 100% 보존) → zip. 다른 슬라이드/리소스는 무변.
 *
 * 검증된 엔진(resolveNode→rollup)만 사용 → 엑셀 100% 일치 유지.
 * R7(점포체화비중): 엔진 정의값(AL/U). 원본 .pptx 버그값(AL/R)과는 의도적으로 상이(엔진이 정답).
 *
 * ※ 슬라이드 2(매장 SCM)·3·4(상품 SCM)·5(목표대비)는 fast-follow — 현재는 템플릿 빈칸 그대로 유지.
 */

import { strToU8, unzipSync, zipSync } from "fflate";

import type { KanbanRow } from "@/lib/engine";
import { findTableRanges, setCellText, type TableRanges } from "./table-xml";
import { resolveNode } from "./resolve-nodes";
import { SLIDE1_COLS, SLIDE1_ROWS, SLIDE1_TABLE_DIMS, formatPptCell } from "./slide1-map";

const SLIDE1_PATH = "ppt/slides/slide1.xml";

export interface InjectInput {
  /** 마스킹 템플릿 바이트(assets/ppt-template.pptx). */
  templateBytes: Uint8Array;
  /** 엔진 Stage1 칸반(period 반영). */
  kanban: KanbanRow[];
  /** 기간 라벨(당월/누적) — 부제 주입용(선택). */
  periodLabel?: string;
}

/** 슬라이드1(① 물류 핵심지표) 표를 채워 .pptx 바이트 반환. */
export function injectSlide1(input: InjectInput): Uint8Array {
  const files = unzipSync(input.templateBytes);
  const slide1 = files[SLIDE1_PATH];
  if (!slide1) {
    throw new Error(`템플릿에 ${SLIDE1_PATH} 가 없습니다(손상된 템플릿).`);
  }
  const dec = new TextDecoder("utf-8");
  let xml = dec.decode(slide1);

  let t: TableRanges = findTableRanges(xml);
  // 표 차원 가드(템플릿이 예상과 다르면 조용한 오주입 방지).
  if (t.rows.length !== SLIDE1_TABLE_DIMS.rows) {
    throw new Error(
      `슬라이드1 표 행수 불일치: ${t.rows.length} ≠ ${SLIDE1_TABLE_DIMS.rows} (템플릿 재생성 필요)`,
    );
  }

  for (const ref of SLIDE1_ROWS) {
    const fact = resolveNode(input.kanban, ref);
    for (const col of SLIDE1_COLS) {
      const value = formatPptCell(col.scale, fact[col.field] as number | null);
      // 빈 셀(런 없음)에는 새 런을 만들지 않음 — 원본이 빈칸이던 위치는 그대로.
      xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
      // 길이 변동 → 재파싱.
      t = findTableRanges(xml);
    }
  }

  files[SLIDE1_PATH] = strToU8(xml);
  return zipSync(files, { level: 6 });
}
