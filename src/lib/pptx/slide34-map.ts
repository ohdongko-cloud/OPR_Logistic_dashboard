/**
 * 슬라이드3·4(실행 모니터링② 상품 SCM) 표 셀 → 상품 엔진(ProductFactRow) 매핑.
 *
 * 근거:
 *   - 02_파일분석/실적_모니터링_PPT보고서_분석.md (Slide3·4: 행=브랜드×MD×시즌, 열=매입/물류/영업 3블록+비고)
 *   - 02_파일분석/상품SCM_뷰_스펙.md §2(필드 출처)·§3-B(브랜드명 디코드 마스터 부재)
 *   - 원본 .pptx 실측: slide3·4 = 25행 × 21열. 데이터행 r02~r24, 데이터열 c02~c20.
 *   - 헤더(r1) 컬럼: c04 입고량 · c08 재고량 · c14 누적출고량 · c15 누적출고율 · c16 누적판매량
 *     · c17 출고비판매율 · c18 입고비판매율 · c19 누적매총율 · c20 비고. (auto 8필드 위치)
 *
 * ⚠️ 자동 주입 보류(공란 유지) — 행↔노드 매핑 키 부재(가짜값 금지 규칙):
 *   - 슬3·4 행 라벨(c0) = **브랜드명_상품군**(예: "○○브랜드_△△", "□□ /2차" 류 — 실명은 템플릿 마스킹)
 *     + MD명(c1). 사람이 읽는 브랜드명 grain.
 *   - 상품 엔진 grain = **구매그룹(F) 3자 코드**(BGB~ 34종) × 시즌(봄/여름/가을/겨울/공통).
 *   - 둘을 잇는 마스터(브랜드명_상품군 → 구매그룹코드)가 코드/RAW 어디에도 없음
 *     (types.ts BRAND_CODE_TO_NAME = {} · spec §3-B "원천 마스터 부재"). grain 도 불일치.
 *   → 어느 표 행에 어느 엔진 노드를 넣을지 **결정론적으로 알 수 없음**. 임의 매핑 = 가짜값.
 *   → 따라서 슬3·4 데이터 셀은 **주입하지 않고 템플릿 빈칸/"—" 그대로 유지**한다.
 *
 * 해소 조건(추후): 브랜드명_상품군 ↔ 구매그룹코드 매핑 마스터 확보 시
 *   SLIDE34_ROWS 를 채우고 SLIDE34_AUTO_COLS 매핑으로 auto 8필드를 주입(아래 골격 사용).
 *
 * ★자동불가 8필드(일자·리드타임)·수기 3필드(정보정확도·P별적합도·비고)는
 *   원천 부재/수기 → 매핑 마스터가 생겨도 공란/annotation 유지(가짜값 금지).
 */

import type { ProductFactRow } from "@/lib/engine-product";
import type { PptScale } from "./slide1-map";

/**
 * 슬3·4 표 데이터행(원본 좌표 row) → 엔진 노드 식별.
 * ⚠️ 현재 **빈 배열** — 매핑 마스터 부재로 주입 보류(위 주석). 마스터 확보 시 채운다.
 */
export const SLIDE34_ROWS: Array<{
  row: number;
  label: string;
  /** 엔진 노드: 구매그룹코드 + 시즌(부재 시 매핑 불가). */
  brandCode: string;
  season: string;
}> = [];

/**
 * 슬3·4 auto 8필드 열(원본 좌표 col) → ProductFactRow 필드 + 포맷.
 * 행 매핑(SLIDE34_ROWS)이 비어있어 현재는 미사용이나, 열 매핑은 헤더 실측으로 확정해 둠.
 */
export const SLIDE34_AUTO_COLS: Array<{
  col: number;
  field: keyof ProductFactRow;
  scale: PptScale;
  label: string;
}> = [
  { col: 4, field: "inQty", scale: "qty", label: "입고량" },
  { col: 8, field: "invQty", scale: "qty", label: "재고량" },
  { col: 14, field: "outQty", scale: "qty", label: "누적출고량" },
  { col: 15, field: "outRate", scale: "pct0", label: "누적출고율" },
  { col: 16, field: "saleQty", scale: "qty", label: "누적판매량" },
  { col: 17, field: "saleVsOut", scale: "pct0", label: "출고비판매율" },
  { col: 18, field: "saleVsIn", scale: "pct0", label: "입고비판매율" },
  { col: 19, field: "grossRate", scale: "pct0", label: "누적매총율" },
];

/** 슬3·4 표 차원: 행 25 × 열 21 (원본 실측 — 무결성 가드). */
export const SLIDE34_TABLE_DIMS = { rows: 25, cols: 21 } as const;
