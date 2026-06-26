/**
 * Stage1 — 아이템 RAW(매출상세·물류재고·센터입출고) → 브랜드(F)×시즌 집계행.
 *
 * 근거: spec §2(필드 출처)·§3(brand grain SUMIFS)·§5-A(측정식 아이템 동일, 키만 F×시즌).
 *
 * 메커니즘(아이템 buildKanban 의 SUMIF 를 brand×season 복합키로 일반화):
 *  1) 각 RAW 행에서 (F=brand, season) 키 추출 → 측정 컬럼 SUM 누적(SUMIFS 1패스 흡수).
 *  2) 시즌은 시트별 위치(매출 T·재고 V·입출고 W) — 아이템 DIM_COLUMNS 와 동일.
 *  3) (brand×season) 키별 자동 6 데이터필드 합산 → 파생 4필드 행단위 재계산.
 *
 * ★측정값은 아이템 엔진과 동일(센터입출고 I/M·물류재고 H·매출상세 H/I/J) — 검증 동치.
 *   차이: 아이템은 조인키 A(SKU), 상품은 조인키 F(구매그룹)+시즌. RAW 풀은 동일.
 *
 * 자동불가(일자·리드타임) 8필드 + 수기 3필드는 본 엔진 범위 밖(뷰 placeholder / annotation).
 */

import { type RawRowRecord, type CellValue } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import {
  BRAND_COL,
  CTR_FLOW_SEASON_COL,
  CTR_INV_SEASON_COL,
  PRODUCT_MEASURE_COLS,
  SALES_SEASON_COL,
} from "./raw-columns";
import {
  PRODUCT_DATA_FIELDS,
  type ProductDataField,
  type ProductFactRow,
} from "./types";

/** 상품 엔진 입력 — 아이템 ingest 의 records(시트별 RawRow[]). */
export interface ProductEngineInput {
  records: Partial<Record<SheetType, RawRowRecord[]>>;
}

/** IFERROR(분자/분모,"") → null(분모0=공란). */
function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/** 셀값 → number(콤마·문자 방어). null = 미가산. */
function numOf(v: CellValue | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 브랜드코드·시즌 정규화(NFKC·trim). 빈값 방어. */
function norm(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).normalize("NFKC").trim();
}

/** (brand,season) 합성키 — 제어문자 구분자(코드·시즌에 등장 불가). */
const KEY_SEP = "";
function gkey(brand: string, season: string): string {
  return `${brand}${KEY_SEP}${season}`;
}

/** 누적행 = brand/season(값 보존) + 데이터 6필드. */
interface AccCell extends Record<ProductDataField, number> {
  brandCode: string;
  season: string;
}

/** 빈 데이터 누적행. */
function blankData(brandCode: string, season: string): AccCell {
  const z = { brandCode, season } as AccCell;
  for (const f of PRODUCT_DATA_FIELDS) z[f] = 0;
  return z;
}

/**
 * 한 RAW 시트를 (brand,season) 키로 SUMIFS 흡수 — 지정 측정필드만 누적.
 * @param rows      시트 RawRowRecord[]
 * @param seasonCol 시즌 컬럼 letter(시트별)
 * @param fieldCols 측정필드명 → 컬럼 letter
 * @param acc       (brand×season) → 데이터 누적 맵(in/out 갱신)
 */
function accumulate(
  rows: RawRowRecord[] | undefined,
  seasonCol: string,
  fieldCols: Partial<Record<ProductDataField, string>>,
  acc: Map<string, AccCell>,
): void {
  if (!rows) return;
  const entries = Object.entries(fieldCols) as Array<[ProductDataField, string]>;
  for (const r of rows) {
    const brand = norm(r.data[BRAND_COL]);
    if (!brand) continue; // 구매그룹 없는 행은 brand grain 집계 제외
    const season = norm(r.data[seasonCol]);
    const key = gkey(brand, season);
    let cur = acc.get(key);
    if (!cur) {
      cur = blankData(brand, season);
      acc.set(key, cur);
    }
    for (const [field, col] of entries) {
      const v = numOf(r.data[col]);
      if (v !== null) cur[field] += v;
    }
  }
}

/** 파생 4필드 재계산(아이템 측정식과 동일 비율식). */
function derive(d: Record<ProductDataField, number>): {
  outRate: number | null;
  saleVsOut: number | null;
  saleVsIn: number | null;
  grossRate: number | null;
} {
  return {
    outRate: safeDiv(d.outQty, d.inQty), // 누적출고율 = 출고/입고
    saleVsOut: safeDiv(d.saleQty, d.outQty), // 출고비판매율 = 판매/출고
    saleVsIn: safeDiv(d.saleQty, d.inQty), // 입고비판매율 = 판매/입고
    grossRate: safeDiv(d.salesAmt - d.cogs, d.salesAmt), // 누적매총율 = (매출−원가)/매출
  };
}

/**
 * Stage1 메인 — RAW → ProductFactRow[](brand×season grain).
 * 측정식은 검증된 아이템 엔진과 동일, 키만 구매그룹(F)×시즌(spec §5-A).
 */
export function buildProductFacts(input: ProductEngineInput): ProductFactRow[] {
  const recs = input.records;
  const acc = new Map<string, AccCell>();

  // 매출상세 — H=실매출액·I=총매출원가·J=판매수량 (시즌 T).
  accumulate(recs["매출상세"], SALES_SEASON_COL, PRODUCT_MEASURE_COLS.매출상세, acc);
  // 물류재고 — H=재고량 (시즌 V).
  accumulate(recs["물류재고"], CTR_INV_SEASON_COL, PRODUCT_MEASURE_COLS.물류재고, acc);
  // 센터입출고 — I=벤더입고량·M=점간출고량 (시즌 W). ★H=금액/I=수량 역전 주의.
  accumulate(recs["센터입출고"], CTR_FLOW_SEASON_COL, PRODUCT_MEASURE_COLS.센터입출고, acc);

  const out: ProductFactRow[] = [];
  for (const cell of acc.values()) {
    out.push({
      brandCode: cell.brandCode,
      season: cell.season,
      inQty: cell.inQty,
      invQty: cell.invQty,
      outQty: cell.outQty,
      saleQty: cell.saleQty,
      salesAmt: cell.salesAmt,
      cogs: cell.cogs,
      ...derive(cell),
    });
  }
  // 안정 정렬: 브랜드코드 → 시즌(표시·검증 결정성).
  out.sort((a, b) =>
    a.brandCode === b.brandCode
      ? a.season.localeCompare(b.season)
      : a.brandCode.localeCompare(b.brandCode),
  );
  return out;
}

export { safeDiv as productSafeDiv, derive as deriveProductRow };
