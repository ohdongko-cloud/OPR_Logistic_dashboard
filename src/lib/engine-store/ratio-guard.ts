/**
 * 매장(store) 뷰 비율 가드 매핑 — 파생 비율필드 → 분모필드·단위.
 *
 * 분모 출처 = StoreNodeMetrics 산식(spec 매장 §4):
 *   saleMult  = AA/W  → 분모 inQtyAll(전체입고량)     · 수량
 *   dotsDays  = V/O or AI/AD → 분모 cogsFix(픽스매출원가, O=N/C1) · 금액
 *   seasonPct = Q/S   → 분모 invAmtFix(픽스재고액)     · 금액
 *   stockRatio= T/I or P/I → 분모 baseInvQty(기준재고량) · 수량
 */

import { RATIO_DENOM_MIN, type DenomUnit } from "@/lib/metric-guard";
import { type StoreNodeMetrics } from "./agg-store-tree";

export interface StoreRatioGuardSpec {
  denomField: keyof StoreNodeMetrics;
  unit: DenomUnit;
}

export const STORE_RATIO_GUARD: Partial<Record<keyof StoreNodeMetrics, StoreRatioGuardSpec>> = {
  saleMult: { denomField: "inQtyAll", unit: "qty" }, // AA/W
  dotsDays: { denomField: "cogsFix", unit: "amount" }, // V/O (O=N/C1, N=cogsFix)
  seasonPct: { denomField: "invAmtFix", unit: "amount" }, // Q/S
  stockRatio: { denomField: "baseInvQty", unit: "qty" }, // P/I or T/I
};

export function storeRatioMin(field: keyof StoreNodeMetrics): number | null {
  const spec = STORE_RATIO_GUARD[field];
  return spec ? RATIO_DENOM_MIN[spec.unit] : null;
}

export function storeRatioDenom(
  field: keyof StoreNodeMetrics,
  metrics: StoreNodeMetrics,
): number | null | undefined {
  const spec = STORE_RATIO_GUARD[field];
  if (!spec) return undefined;
  return metrics[spec.denomField] as number | null;
}
