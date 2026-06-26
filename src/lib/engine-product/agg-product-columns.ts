/**
 * 상품 뷰 컬럼/필드 정의 — PPT 슬3·4 (입고→상품화→판매 3블록 + 비고).
 *
 * 근거: 02_파일분석/상품SCM_뷰_스펙.md §2(필드 출처 판정)·§4(권장 뷰 구조).
 *
 * 3종 필드:
 *   - auto(자동 8필드): ProductNodeMetrics 값 채움. format 으로 표시.
 *   - na(자동불가 8필드, 일자·리드타임): 원천(SAP 일자) 부재 → "—" + "원천 필요(추후)".
 *   - manual(수기 3필드, 정보정확도·P별적합도·비고): annotation 입력 슬롯(INPUT 권한).
 *
 * ★자동불가/수기 필드는 가짜값 금지 — 명시적 placeholder("—") + 사유 표기(헌장 §보안·정직).
 */

import { type ProductNodeMetrics } from "./agg-product-tree";

export type ProductColFormat = "eok" | "pct" | "qty" | "mult";
/** 필드 종류: 자동집계 / 자동불가(원천부재) / 수기(annotation). */
export type ProductFieldKind = "auto" | "na" | "manual";

/** auto 컬럼 — 엔진 지표 채움. */
export interface ProductAutoCol {
  kind: "auto";
  field: keyof ProductNodeMetrics;
  label: string;
  format: ProductColFormat;
  /** 출처 추적(스펙 §2). */
  source: string;
  defaultVisible: boolean;
}

/** na 컬럼 — 원천 부재, placeholder("—"). */
export interface ProductNaCol {
  kind: "na";
  label: string;
  /** 부재 사유(스펙 §2 — 일자·리드타임 원천 없음). */
  reason: string;
}

/** manual 컬럼 — annotation 입력 슬롯. */
export interface ProductManualCol {
  kind: "manual";
  label: string;
  /** annotation metricCode(입력 grain 식별). */
  metricCode: string;
  /** 입력 유형. */
  input: "text" | "rating";
}

export type ProductCol = ProductAutoCol | ProductNaCol | ProductManualCol;

/** 블록(입고·상품화·판매·비고) + 하위 컬럼. */
export interface ProductColGroup {
  title: string;
  /** 책임 라벨(PPT — 매입/물류/영업). */
  responsibility: string;
  cols: ProductCol[];
}

/**
 * PPT 슬3·4 컬럼 — 3블록 + 비고. auto 8 · na 8 · manual 3 = 19필드(스펙 §2-E).
 */
export const PRODUCT_COL_GROUPS: ProductColGroup[] = [
  {
    title: "입고 (매입)",
    responsibility: "매입 책임",
    cols: [
      { kind: "na", label: "입고예정일", reason: "발주·납기예정일 = SAP PO(본 6탭 부재)" },
      { kind: "na", label: "입고일", reason: "RAW=기간 유량 집계본, 거래일자 없음" },
      { kind: "auto", field: "inQty", label: "입고량", format: "qty", source: "센터입출고 I(벤더입고량)", defaultVisible: true },
      { kind: "manual", label: "정보정확도", metricCode: "PROD_INFO_ACCURACY", input: "rating" },
      { kind: "na", label: "정보전달일", reason: "이벤트 일자 — RAW 부재" },
    ],
  },
  {
    title: "상품화 (물류)",
    responsibility: "물류 책임",
    cols: [
      { kind: "na", label: "상품화속도", reason: "입고→가용 리드타임 — 일자 2개 부재" },
      { kind: "auto", field: "invQty", label: "재고량", format: "qty", source: "물류재고 H(재고량)", defaultVisible: true },
      { kind: "manual", label: "P별 적합도", metricCode: "PROD_PROCESS_FIT", input: "rating" },
      { kind: "na", label: "최초출고일", reason: "이벤트 일자 — RAW 유량집계 부재" },
      { kind: "na", label: "대기일수", reason: "입고~출고 대기 — 일자 2개 부재" },
    ],
  },
  {
    title: "판매 (영업)",
    responsibility: "영업 책임",
    cols: [
      { kind: "na", label: "출고속도", reason: "출고 리드타임 — 일자 부재" },
      { kind: "na", label: "출고일수", reason: "일자 부재" },
      { kind: "auto", field: "outQty", label: "누적출고량", format: "qty", source: "센터입출고 M(점간출고량)", defaultVisible: true },
      { kind: "auto", field: "outRate", label: "누적출고율", format: "pct", source: "(파생) 출고÷입고", defaultVisible: true },
      { kind: "auto", field: "saleQty", label: "누적판매량", format: "qty", source: "매출상세 J(판매수량)", defaultVisible: true },
      { kind: "auto", field: "saleVsOut", label: "출고비판매율", format: "pct", source: "(파생) 판매÷출고", defaultVisible: true },
      { kind: "auto", field: "saleVsIn", label: "입고비판매율", format: "pct", source: "(파생) 판매÷입고", defaultVisible: true },
      { kind: "auto", field: "grossRate", label: "누적매총율", format: "pct", source: "(파생) (매출−원가)÷매출", defaultVisible: true },
    ],
  },
  {
    title: "비고",
    responsibility: "수기",
    cols: [
      { kind: "manual", label: "비고", metricCode: "PROD_REMARK", input: "text" },
    ],
  },
];

/** 평탄 컬럼(테이블·엑셀). */
export const PRODUCT_FLAT_COLS: ProductCol[] = PRODUCT_COL_GROUPS.flatMap((g) => g.cols);

/** auto 컬럼만(엔진 지표). */
export const PRODUCT_AUTO_COLS: ProductAutoCol[] = PRODUCT_FLAT_COLS.filter(
  (c): c is ProductAutoCol => c.kind === "auto",
);

/** manual 컬럼만(annotation). */
export const PRODUCT_MANUAL_COLS: ProductManualCol[] = PRODUCT_FLAT_COLS.filter(
  (c): c is ProductManualCol => c.kind === "manual",
);

/** 필드 분류 집계(스펙 §2-E — auto 8·na 8·manual 3). */
export const PRODUCT_FIELD_COUNTS = {
  auto: PRODUCT_FLAT_COLS.filter((c) => c.kind === "auto").length,
  na: PRODUCT_FLAT_COLS.filter((c) => c.kind === "na").length,
  manual: PRODUCT_FLAT_COLS.filter((c) => c.kind === "manual").length,
};
