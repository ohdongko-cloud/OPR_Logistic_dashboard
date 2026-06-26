/**
 * 드릴다운 테이블·엑셀 내보내기 공통 컬럼 정의.
 *
 * 설계 §2-A(25지표) · §3-2(열 선택: 기본 6~8 KPI열 + 확장).
 * 화면과 엑셀이 **동일 컬럼**(요구사항: 내보내기 컬럼 = 화면 컬럼) → 단일 소스.
 *
 * format = 표시 종류(억/%/일/량/배). align/critical 은 표시 강조용.
 */

import { type FactRow } from "./types";

export type ColFormat = "eok" | "pct" | "days" | "qty" | "num";

export interface AggColumn {
  /** FactRow 필드 키. */
  field: keyof FactRow;
  /** 헤더 라벨(한국어). */
  label: string;
  /** 엑셀열 letter(추적·검증용 주석). */
  excelCol: string;
  format: ColFormat;
  /** 기본 노출(KPI 6열). false 면 "열 선택"으로만. */
  defaultVisible: boolean;
  /** 임계 강조 종류(낮을수록/높을수록 경고). */
  critical?: "ratioHigh" | "negative" | "daysHigh" | "multLow";
}

/** 설계 §2-A 25지표 → 표시 가능한 데이터·파생 컬럼(빈칸열 제외). */
export const AGG_COLUMNS: AggColumn[] = [
  // ── 기본 노출(KPI/핵심) ──
  { field: "sales", label: "실매출(추정)", excelCol: "E", format: "eok", defaultVisible: true },
  { field: "logiCost", label: "물류비", excelCol: "F", format: "eok", defaultVisible: true },
  { field: "logiRatio", label: "물류비율", excelCol: "G", format: "pct", defaultVisible: true, critical: "ratioHigh" },
  { field: "dotsCtr", label: "센터재고일수", excelCol: "I", format: "days", defaultVisible: true, critical: "daysHigh" },
  { field: "invAmtTotal", label: "총기말재고액", excelCol: "R", format: "eok", defaultVisible: true },
  { field: "deadCtrPct", label: "센터체화비중", excelCol: "AK", format: "pct", defaultVisible: true, critical: "ratioHigh" },
  // ── 확장(열 선택) ──
  { field: "rent", label: "임차료", excelCol: "K", format: "eok", defaultVisible: false },
  { field: "labor", label: "인건비", excelCol: "L", format: "eok", defaultVisible: false },
  { field: "freight", label: "운반비", excelCol: "M", format: "eok", defaultVisible: false },
  { field: "pack", label: "포장비", excelCol: "N", format: "eok", defaultVisible: false },
  { field: "dotsTotal", label: "총재고일수", excelCol: "H", format: "days", defaultVisible: false, critical: "daysHigh" },
  { field: "dotsSto", label: "점포재고일수", excelCol: "J", format: "days", defaultVisible: false, critical: "daysHigh" },
  { field: "ctrQty", label: "센터재고량", excelCol: "O", format: "qty", defaultVisible: false },
  { field: "ctrAmt", label: "센터재고액", excelCol: "P", format: "eok", defaultVisible: false },
  { field: "stoQty", label: "점포재고량", excelCol: "T", format: "qty", defaultVisible: false },
  { field: "stoAmt", label: "점포재고액", excelCol: "U", format: "eok", defaultVisible: false },
  { field: "avgInvCtr", label: "센터평균재고", excelCol: "AA", format: "eok", defaultVisible: false },
  { field: "dailyOut", label: "일평균소진액", excelCol: "AD", format: "eok", defaultVisible: false },
  { field: "inQty", label: "입고량", excelCol: "AF", format: "qty", defaultVisible: false },
  { field: "outQty", label: "출고량", excelCol: "AG", format: "qty", defaultVisible: false },
  { field: "retQty", label: "반품량", excelCol: "AH", format: "qty", defaultVisible: false },
  { field: "ctrDeadAmt", label: "센터체화액", excelCol: "AJ", format: "eok", defaultVisible: false },
  { field: "stoDeadAmt", label: "지점체화액", excelCol: "AL", format: "eok", defaultVisible: false },
  { field: "deadStoPct", label: "지점체화비중", excelCol: "AM", format: "pct", defaultVisible: false, critical: "ratioHigh" },
];

/** 임계 강조 기본 임계치(목표값 미입력 시 휴리스틱 — 설계 §3-2 "물류비율<목표/재고일수<목표"). */
export const CRITICAL_THRESHOLDS = {
  /** 물류비율·체화비중 경고 상한(예: 20%↑ 주의). */
  ratioHigh: 0.2,
  /** 재고일수 경고 상한(예: 120일↑). */
  daysHigh: 120,
};

/** 셀값이 임계 초과(경고)인지 판정. */
export function isCritical(col: AggColumn, value: number | null): boolean {
  if (value == null) return false;
  switch (col.critical) {
    case "ratioHigh":
      return value >= CRITICAL_THRESHOLDS.ratioHigh;
    case "daysHigh":
      return value >= CRITICAL_THRESHOLDS.daysHigh;
    case "negative":
      return value < 0;
    default:
      return false;
  }
}
