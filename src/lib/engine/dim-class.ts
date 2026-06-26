/**
 * 분류 마스터(#분류) → VLOOKUP 조회 맵.
 *
 * 근거: spec §1 조인키 메커니즘 · §3-1(칸반 CA/CB) · 실파일 #분류 실측.
 *  - 성별(gender): VLOOKUP(C, '#분류'!$C:$D, 2) — 대구분(키)→대조합(반환).
 *    골드여성→여성, 골드남성→남성 병합.
 *  - 아이템(item): VLOOKUP(D, '#분류'!$S:$U, 2) — 대분류(키)→대조합(반환).
 *    스포츠/골프/캐쥬얼→액티브, 정장→명품류, 기타/리빙→잡화류 수렴.
 *
 * ⚠️ SheetJS 가 #분류 선두 빈 A열을 드롭 → 원본 C/D/S/T 가 파싱 후 B/C/R/S 로 -1 시프트.
 *    컬럼 letter 고정은 취약 → **두 매핑 블록(성별쌍·아이템쌍)을 라벨/도메인으로 자동 검출**.
 *
 * VLOOKUP 의 "첫 매칭 행 반환"(exact 0) 시맨틱 재현(중복 키는 처음 등장값).
 */

import { normalizeKey } from "@/lib/ingest/normalize";
import { type RawRowRecord, type CellValue } from "@/lib/ingest/parse-workbook";

/** VLOOKUP 조회 맵 두 종. */
export interface DimClassMaps {
  /** 정규화된 대구분 → gender(대조합). */
  gender: Map<string, string>;
  /** 정규화된 대분류 → item(대조합). */
  item: Map<string, string>;
}

/** 성별 대구분 도메인(키쪽 식별용). */
const GENDER_KEYS = new Set(
  ["여성", "남성", "아동", "골드여성", "골드남성"].map((s) => norm(s)),
);
/** 성별 대조합 도메인(값쪽). */
const GENDER_VALS = new Set(["여성", "남성", "아동"].map((s) => norm(s)));
/** 아이템 대조합(값쪽) 도메인. */
const ITEM_VALS = new Set(
  ["상의류", "하의류", "액티브", "명품류", "잡화류", "내의류", "아동복"].map((s) =>
    norm(s),
  ),
);

/**
 * #분류 RawRow[] → 두 VLOOKUP 맵.
 *
 * 컬럼 자동검출:
 *  - 성별쌍 = (키 컬럼: 값이 GENDER_KEYS 다수) → (그 우측 인접 컬럼: GENDER_VALS).
 *  - 아이템쌍 = (값 컬럼: ITEM_VALS 다수) → 그 좌측 인접 컬럼이 키(대분류).
 * 인접성(letter 연속)으로 쌍 확정. 실측 #분류는 대구분|대조합 인접, 대분류|대조합 인접.
 */
export function buildDimClassMaps(classRows: RawRowRecord[]): DimClassMaps {
  const gender = new Map<string, string>();
  const item = new Map<string, string>();
  if (classRows.length === 0) return { gender, item };

  const { genderKeyCol, genderValCol, itemKeyCol, itemValCol } =
    detectColumns(classRows);

  for (const r of classRows) {
    if (genderKeyCol && genderValCol) {
      const gKey = norm(r.data[genderKeyCol]);
      const gVal = str(r.data[genderValCol]);
      if (gKey && gVal && !gender.has(gKey)) gender.set(gKey, gVal);
    }
    if (itemKeyCol && itemValCol) {
      const iKey = norm(r.data[itemKeyCol]);
      const iVal = str(r.data[itemValCol]);
      if (iKey && iVal && !item.has(iKey)) item.set(iKey, iVal);
    }
  }

  return { gender, item };
}

interface DetectedCols {
  genderKeyCol: string | null;
  genderValCol: string | null;
  itemKeyCol: string | null;
  itemValCol: string | null;
}

/** 컬럼별 값 분포를 스캔해 성별/아이템 키·값 컬럼을 자동 검출. */
function detectColumns(classRows: RawRowRecord[]): DetectedCols {
  // 컬럼 letter → 도메인 적중 카운트.
  const cols = new Set<string>();
  for (const r of classRows) for (const c of Object.keys(r.data)) cols.add(c);

  const genderKeyHits = new Map<string, number>();
  const genderValHits = new Map<string, number>();
  const itemValHits = new Map<string, number>();

  for (const r of classRows) {
    for (const c of cols) {
      const v = norm(r.data[c]);
      if (!v) continue;
      if (GENDER_KEYS.has(v)) inc(genderKeyHits, c);
      if (GENDER_VALS.has(v)) inc(genderValHits, c);
      if (ITEM_VALS.has(v)) inc(itemValHits, c);
    }
  }

  // 성별 키 컬럼 = 골드* 포함(키 전용 도메인) 최다 컬럼. 값 컬럼 = 키 우측 인접 + VALS 최다.
  const genderKeyCol = pickGenderKeyCol(classRows, genderKeyHits);
  const genderValCol = genderKeyCol
    ? adjacentRight(genderKeyCol, genderValHits)
    : topCol(genderValHits);

  // 아이템 값 컬럼 = ITEM_VALS 최다(성별값 컬럼과 구분: 아이템 전용 라벨 보유).
  const itemValCol = topCol(itemValHits, [genderValCol].filter(Boolean) as string[]);
  // 아이템 키 컬럼 = 값 좌측 인접(대분류|대조합 인접).
  const itemKeyCol = itemValCol ? adjacentLeft(itemValCol) : null;

  return { genderKeyCol, genderValCol, itemKeyCol, itemValCol };
}

/** 성별 키 컬럼 = "골드여성/골드남성"(키 전용) 출현 컬럼 우선, 없으면 GENDER_KEYS 최다. */
function pickGenderKeyCol(
  classRows: RawRowRecord[],
  genderKeyHits: Map<string, number>,
): string | null {
  const goldHits = new Map<string, number>();
  const goldSet = new Set(["골드여성", "골드남성"].map((s) => norm(s)));
  for (const r of classRows) {
    for (const c of Object.keys(r.data)) {
      if (goldSet.has(norm(r.data[c]))) inc(goldHits, c);
    }
  }
  return topCol(goldHits) ?? topCol(genderKeyHits);
}

/** map 의 최대 카운트 컬럼(제외목록 제외). */
function topCol(m: Map<string, number>, exclude: string[] = []): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of m) {
    if (exclude.includes(c)) continue;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

/** key 컬럼의 letter 바로 우측 컬럼이 hits 에 있으면 그것, 아니면 hits 최다. */
function adjacentRight(keyCol: string, hits: Map<string, number>): string | null {
  const right = shiftCol(keyCol, +1);
  if (hits.has(right)) return right;
  return topCol(hits);
}

function adjacentLeft(valCol: string): string | null {
  return shiftCol(valCol, -1);
}

/** 컬럼 letter ± n. */
function shiftCol(letter: string, delta: number): string {
  const idx = colIndex(letter) + delta;
  return colLetterOf(Math.max(0, idx));
}

function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colLetterOf(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function inc(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

/** VLOOKUP 조회 — exact match(정규화). 미스 → null(엑셀 #N/A → 공란/미집계). */
export function lookupGender(maps: DimClassMaps, daegubun: unknown): string | null {
  return maps.gender.get(norm(daegubun as CellValue)) ?? null;
}

export function lookupItem(maps: DimClassMaps, daebunlyu: unknown): string | null {
  return maps.item.get(norm(daebunlyu as CellValue)) ?? null;
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return normalizeKey(typeof v === "string" ? v : String(v));
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).normalize("NFKC").trim();
}
