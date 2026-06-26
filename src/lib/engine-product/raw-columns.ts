/**
 * 상품(브랜드) 엔진 RAW 컬럼 핀고정 — 구매그룹(F) 조인키 + 측정·시즌 컬럼.
 *
 * 근거: 02_파일분석/상품SCM_뷰_스펙.md §3-B 조인키 + 실파일 실측(2026-06-26).
 *   ★브랜드축 = RAW 6탭 **F열 = 구매그룹(Now:상품)** (3자 코드 34종).
 *     F5 헤더 `구매그룹(Now:상품)` — 매출상세·물류재고·센터입출고 모두 동일.
 *   ★시즌축 = 아이템 엔진 DIM_COLUMNS.season 좌표 그대로 재사용:
 *     매출상세 T · 물류재고 V · 센터입출고 W (5종: 봄/여름/가을/겨울/공통, 실측 확인).
 *
 * 측정 컬럼(아이템 MEASURE_COLUMNS 와 동일 — 키만 brand×season SUMIFS):
 *   매출상세 : H=실매출액 · I=총매출원가 · J=판매수량
 *   물류재고 : H=재고량
 *   센터입출고: I=벤더입고량(입고) · M=점간출고량(출고)   (★H=금액/I=수량 역전 주의 — 아이템 spec §2)
 */

import { DIM_COLUMNS } from "@/lib/engine/raw-columns";

/** 브랜드 조인키 = 구매그룹(상품) F열. RAW 6탭 공통. */
export const BRAND_COL = "F";

/** 시즌 컬럼(시트별) — 아이템 DIM_COLUMNS.season 재사용(단일 진실원). */
export const SALES_SEASON_COL = DIM_COLUMNS["매출상세"]!.season; // T
export const CTR_INV_SEASON_COL = DIM_COLUMNS["물류재고"]!.season; // V
export const CTR_FLOW_SEASON_COL = DIM_COLUMNS["센터입출고"]!.season; // W

/** 측정 컬럼(spec §2 출처 — 아이템 엔진과 동일 좌표). */
export const PRODUCT_MEASURE_COLS = {
  /** 매출상세: H=실매출액 · I=총매출원가 · J=판매수량 */
  매출상세: { salesAmt: "H", cogs: "I", saleQty: "J" },
  /** 물류재고: H=재고량 */
  물류재고: { invQty: "H" },
  /** 센터입출고: I=벤더입고량(입고) · M=점간출고량(출고) */
  센터입출고: { inQty: "I", outQty: "M" },
} as const;
