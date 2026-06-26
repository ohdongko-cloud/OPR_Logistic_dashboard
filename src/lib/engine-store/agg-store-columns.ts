/**
 * 매장 뷰 테이블·엑셀 내보내기 공통 컬럼 정의.
 *
 * 근거: spec 매장 §3(대시보드 열)·§4(지표 사전) · ※지점대시보드 카드 레이아웃.
 * 화면·엑셀 동일 컬럼(단일 소스). format = 표시 종류(억/%/일/배/량).
 */

import { type StoreNodeMetrics } from "./agg-store-tree";

export type StoreColFormat = "eok" | "pct" | "days" | "qty" | "mult";

export interface StoreAggColumn {
  field: keyof StoreNodeMetrics;
  label: string;
  /** 엑셀열 letter(칸반/대시 추적용). */
  excelCol: string;
  format: StoreColFormat;
  defaultVisible: boolean;
  /** 임계 강조(높을수록/음수 경고). */
  critical?: "daysHigh" | "negative" | "multLow" | "ratioLow";
}

/** 그룹 헤더 + 하위 컬럼(레퍼런스 양식 넓은 표). */
export interface StoreColGroup {
  title: string;
  cols: StoreAggColumn[];
}

export const STORE_COL_GROUPS: StoreColGroup[] = [
  {
    title: "운영지표",
    cols: [
      { field: "saleMult", label: "판매배수", excelCol: "D", format: "mult", defaultVisible: true, critical: "multLow" },
      { field: "dotsDays", label: "재고일수", excelCol: "E", format: "days", defaultVisible: true, critical: "daysHigh" },
      { field: "seasonPct", label: "시즌비중", excelCol: "F", format: "pct", defaultVisible: true },
      { field: "stockRatio", label: "재고보유율", excelCol: "G", format: "mult", defaultVisible: true },
    ],
  },
  {
    title: "(−)마이너스재고",
    cols: [
      { field: "negQty", label: "(−)수량", excelCol: "V", format: "qty", defaultVisible: true, critical: "negative" },
      { field: "negAmt", label: "(−)금액", excelCol: "W", format: "eok", defaultVisible: true, critical: "negative" },
    ],
  },
  {
    title: "입고·판매(픽스)",
    cols: [
      { field: "inQtyFix", label: "입고량", excelCol: "H", format: "qty", defaultVisible: false },
      { field: "saleQtyFix", label: "판매량", excelCol: "L", format: "qty", defaultVisible: true },
    ],
  },
  {
    title: "재고(픽스)",
    cols: [
      { field: "summerInvQty", label: "여름재고량", excelCol: "P", format: "qty", defaultVisible: false },
      { field: "invQtyFix", label: "재고량", excelCol: "R", format: "qty", defaultVisible: true },
      { field: "invAmtFix", label: "재고액", excelCol: "S", format: "eok", defaultVisible: false },
    ],
  },
  {
    title: "입고·판매·재고(전체)",
    cols: [
      { field: "inQtyAll", label: "입고량", excelCol: "W", format: "qty", defaultVisible: false },
      { field: "saleQtyAll", label: "판매량", excelCol: "AA", format: "qty", defaultVisible: false },
      { field: "invQtyAll", label: "기말재고량", excelCol: "AE", format: "qty", defaultVisible: false },
      { field: "invAmtAll", label: "기말재고액", excelCol: "AF", format: "eok", defaultVisible: false },
    ],
  },
];

export const STORE_FLAT_COLS: StoreAggColumn[] = STORE_COL_GROUPS.flatMap((g) => g.cols);

/** 임계 휴리스틱(목표 미입력 시). */
export const STORE_CRITICAL_THRESHOLDS = {
  daysHigh: 150, // 재고일수 경고(일)
  multLow: 0.8, // 판매배수 경고 하한(입고대비 판매 저조)
  ratioLow: 0.5, // 재고보유율 경고 하한
};

/** 셀값이 임계(경고)인지 — (−)재고는 음수면 경고. */
export function isStoreCritical(col: StoreAggColumn, v: number | null): boolean {
  if (v == null) return false;
  switch (col.critical) {
    case "daysHigh":
      return v >= STORE_CRITICAL_THRESHOLDS.daysHigh;
    case "negative":
      return v < 0;
    case "multLow":
      return v > 0 && v < STORE_CRITICAL_THRESHOLDS.multLow;
    case "ratioLow":
      return v > 0 && v < STORE_CRITICAL_THRESHOLDS.ratioLow;
    default:
      return false;
  }
}
