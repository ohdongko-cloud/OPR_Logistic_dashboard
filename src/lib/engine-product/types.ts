/**
 * 상품(브랜드) SCM 엔진 공용 타입 — 브랜드(구매그룹 F) × 시즌 grain.
 *
 * 근거: 02_파일분석/상품SCM_뷰_스펙.md (§2 필드 판정·§3 grain·조인키·§5 구현권고)
 *        · PPT 슬3·4(입고→상품화→판매 3블록 + 비고).
 *
 * 흐름:
 *   아이템 RAW(매출상세·물류재고·센터입출고) ─Stage1→ ProductFactRow[]
 *     (브랜드코드 F × 시즌 G grain, SUMIFS 동치) — 자동 8필드 산출.
 *   ─Stage2→ ProductTree (전체→브랜드→시즌 3단) — buildProductAggTree.
 *
 * ★측정식은 검증된 아이템 엔진과 동일, 키만 구매그룹(F)×시즌으로 교체(spec §5-A).
 *   자동 8필드: 입고량·재고량·누적출고량·누적출고율·누적판매량·출고비판매율·입고비판매율·누적매총율.
 *   자동불가(원천 일자 부재) 8필드 + 수기(annotation) 3필드는 엔진 밖(뷰 placeholder / annotation).
 */

/** 시즌(공통 포함) — 브랜드 하위 grain. */
export const PRODUCT_SEASONS = ["봄", "여름", "가을", "겨울", "공통"] as const;
export type ProductSeason = (typeof PRODUCT_SEASONS)[number] | string;

/**
 * 상품 엔진 집계 1행 — 브랜드(구매그룹 F) × 시즌 grain(또는 브랜드 소계·전체).
 *
 * ── 자동 데이터필드(가산 SUM 대상, RAW SUMIFS 동치) ──
 *   입고량 inQty   ← 센터입출고 I(벤더입고량)  · SUMIFS(센터입출고!I, F=brand, season)
 *   재고량 invQty  ← 물류재고 H(재고량)        · SUMIFS(물류재고!H, F=brand, season)
 *   출고량 outQty  ← 센터입출고 M(점간출고량)  · SUMIFS(센터입출고!M, F=brand, season)
 *   판매량 saleQty ← 매출상세 J(판매수량)      · SUMIFS(매출상세!J, F=brand, season)
 *   매출액 salesAmt← 매출상세 H(실매출액)      · 누적매총율 분자/분모용
 *   매출원가 cogs  ← 매출상세 I(총매출원가)    · 누적매총율 분자용
 *
 * ── 파생필드(집계 후 행단위 재계산, 비율 합산 금지) ──
 *   출고율   outRate  = outQty / inQty   (누적출고율)
 *   출고비판매 saleVsOut = saleQty / outQty
 *   입고비판매 saleVsIn  = saleQty / inQty
 *   매총율   grossRate = (salesAmt − cogs) / salesAmt   (누적매총율)
 */
export interface ProductFactRow {
  /** 브랜드코드(구매그룹 F). 집계행은 라벨("전체"). */
  brandCode: string;
  /** 시즌(브랜드 하위). 브랜드 소계·전체행은 "". */
  season: string;

  // ── 자동 데이터필드(SUM 가산) ──
  inQty: number; // 입고량 ← 센터입출고 I
  invQty: number; // 재고량 ← 물류재고 H
  outQty: number; // 누적출고량 ← 센터입출고 M
  saleQty: number; // 누적판매량 ← 매출상세 J
  salesAmt: number; // 실매출액 ← 매출상세 H
  cogs: number; // 총매출원가 ← 매출상세 I

  // ── 자동 파생필드(IFERROR(분자/분모,"") = 분모0 → null) ──
  outRate: number | null; // 누적출고율 = outQty/inQty
  saleVsOut: number | null; // 출고비판매율 = saleQty/outQty
  saleVsIn: number | null; // 입고비판매율 = saleQty/inQty
  grossRate: number | null; // 누적매총율 = (salesAmt−cogs)/salesAmt
}

/** 데이터필드(가산 SUM 대상) — 파생 제외. */
export const PRODUCT_DATA_FIELDS = [
  "inQty",
  "invQty",
  "outQty",
  "saleQty",
  "salesAmt",
  "cogs",
] as const satisfies readonly (keyof ProductFactRow)[];

export type ProductDataField = (typeof PRODUCT_DATA_FIELDS)[number];

/** 상품 계층 레벨(3단). */
export type ProductLevel = "L0_TOTAL" | "L1_BRAND" | "L2_SEASON";

/**
 * 브랜드코드 → 브랜드명 매핑(현재 부재 — spec §1-B·§3-B).
 * #분류 K:L 은 구매그룹코드를 성별로만 해석하고 브랜드명 디코드 마스터가 없음.
 * ⚠️ TODO(원천 확보): 구매그룹코드→브랜드명 마스터 도입 시 이 맵을 채운다.
 *   미정 동안 화면은 **구매그룹 코드 그대로** 표시(가짜 브랜드명 금지).
 */
export const BRAND_CODE_TO_NAME: Record<string, string> = {
  // TODO: 코드→브랜드명 매핑 (원천 마스터 부재 — spec §3-B). 비우면 코드 표시.
};

/** 브랜드코드 → 표시명(매핑 있으면 "코드 · 명", 없으면 코드). */
export function brandDisplayName(code: string): string {
  const name = BRAND_CODE_TO_NAME[code];
  return name ? `${code} · ${name}` : code;
}
