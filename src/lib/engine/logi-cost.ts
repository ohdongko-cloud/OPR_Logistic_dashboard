/**
 * 물류비 예측 시트 → 7개 총액 추출(칸반 8행 전체 소스).
 *
 * 근거: spec §2(C5..C16) · §3-3 물류비 4대비용 안분. 실파일 물류비예측 실측:
 *   "(임차+관리비)"=임차료(BI8) · "수도광열비"=수광비(BK8) ·
 *   "정직원"=정직원인건비(BR8) · "도급"=도급비(BP8) · "배송비"=운반비(BT8) ·
 *   "포장비"=박스비(BX8) · "기타"=부자재비(BZ8).
 *
 * ⚠️ SheetJS 가 빈 A열을 드롭 → 파싱 후 구조에서 index0=구분(라벨), index1=금액.
 *    따라서 라벨 매칭(data.A=구분)으로 추출(절대셀 의존 제거 — 컬럼 시프트 견고).
 */

import { normalizeKey } from "@/lib/ingest/normalize";
import { type RawRowRecord } from "@/lib/ingest/parse-workbook";

/** 칸반 8행(전체) 물류비 총액 7종. */
export interface LogiCostTotals {
  /** BI8 임차료 */
  rent: number;
  /** BK8 수광비 */
  receive: number;
  /** BR8 정직원인건비 */
  staff: number;
  /** BP8 도급비 */
  outsource: number;
  /** BT8 운반비 */
  freight: number;
  /** BX8 박스비 */
  box: number;
  /** BZ8 부자재비 */
  material: number;
}

/** 라벨(정규화) → 총액필드. 동의어 다중 매핑. */
const LABEL_MAP: Record<string, keyof LogiCostTotals> = {
  임차관리비: "rent",
  임차관리비고정비: "rent",
  공간비: "rent", // 폴백: 공간비=임차+관리비(동값)
  수도광열비: "receive",
  정직원: "staff",
  도급: "outsource",
  배송비: "freight",
  운반비: "freight",
  포장비: "box",
  기타: "material",
};

/**
 * 물류비예측 RawRow[] → 7 총액.
 * 라벨 매칭 우선, "공간비"는 "(임차+관리비)" 미발견 시 폴백(실측상 두 행 동값).
 */
export function extractLogiCostTotals(logiRows: RawRowRecord[]): LogiCostTotals {
  const out: Partial<LogiCostTotals> = {};
  let sawRentDetail = false;

  for (const r of logiRows) {
    const label = normalizeKey(strOf(r.data.A)); // index0 = 구분 라벨
    const amount = numOf(r.data.B); // index1 = 금액
    if (!label || amount === null) continue;

    if (label.includes("임차") && label.includes("관리비")) {
      out.rent = amount;
      sawRentDetail = true;
      continue;
    }
    const field = LABEL_MAP[label];
    if (!field) continue;
    // 공간비 폴백은 상세(임차+관리비) 없을 때만.
    if (field === "rent" && sawRentDetail) continue;
    if (out[field] === undefined) out[field] = amount;
  }

  return {
    rent: out.rent ?? 0,
    receive: out.receive ?? 0,
    staff: out.staff ?? 0,
    outsource: out.outsource ?? 0,
    freight: out.freight ?? 0,
    box: out.box ?? 0,
    material: out.material ?? 0,
  };
}

function strOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function numOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}
