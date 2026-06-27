/**
 * 아이템(engine) 뷰 비율 가드 매핑 — 파생 비율필드 → 분모필드·단위.
 *
 * 희소 분모 표기 보류(metric-guard)를 tree-table·KPI 에 일관 적용하기 위한 단일 소스.
 * 분모 출처 = FactRow 산식(types.ts 주석):
 *   logiRatio = F/E (분모 sales)         · 금액
 *   dotsTotal = avgInvTotal/dailyOut     · 금액(dailyOut=일평균소진액)
 *   dotsCtr   = avgInvCtr/dailyOut       · 금액
 *   dotsSto   = avgInvSto/dailyOut       · 금액
 *   deadCtrPct= ctrDeadAmt/ctrAmt        · 금액(ctrAmt=센터재고액)
 *   deadStoPct= stoDeadAmt/stoAmt        · 금액(stoAmt=점포재고액)
 */

import { RATIO_DENOM_MIN, type DenomUnit } from "@/lib/metric-guard";
import { type FactRow } from "./types";

export interface RatioGuardSpec {
  /** 분모로 쓸 FactRow 필드. */
  denomField: keyof FactRow;
  /** 단위(금액/수량) → 임계 선택. */
  unit: DenomUnit;
}

/** 비율필드 → 분모 스펙. 여기 없는 필드는 가드 미적용(가산값·일반). */
export const ENGINE_RATIO_GUARD: Partial<Record<keyof FactRow, RatioGuardSpec>> = {
  logiRatio: { denomField: "sales", unit: "amount" }, // F/E
  dotsTotal: { denomField: "dailyOut", unit: "amount" }, // 평균재고/일평균소진
  dotsCtr: { denomField: "dailyOut", unit: "amount" },
  dotsSto: { denomField: "dailyOut", unit: "amount" },
  deadCtrPct: { denomField: "ctrAmt", unit: "amount" }, // AJ/P (분모=센터재고액)
  deadStoPct: { denomField: "stoAmt", unit: "amount" }, // AL/U (분모=점포재고액)
};

/** field 의 가드 임계(분모 최소). 없으면 null. */
export function engineRatioMin(field: keyof FactRow): number | null {
  const spec = ENGINE_RATIO_GUARD[field];
  return spec ? RATIO_DENOM_MIN[spec.unit] : null;
}

/** field 의 분모값을 metrics 에서 꺼낸다(가드 미적용 필드는 undefined). */
export function engineRatioDenom(
  field: keyof FactRow,
  metrics: Pick<FactRow, keyof FactRow>,
): number | null | undefined {
  const spec = ENGINE_RATIO_GUARD[field];
  if (!spec) return undefined;
  return metrics[spec.denomField] as number | null;
}
