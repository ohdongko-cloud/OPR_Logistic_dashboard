/**
 * 상품(product) 뷰 비율 가드 매핑 — 파생 비율필드 → 분모필드·단위.
 *
 * 분모 출처 = ProductNodeMetrics 산식(types.ts):
 *   outRate   = outQty/inQty            → 분모 inQty(입고량)    · 수량
 *   saleVsOut = saleQty/outQty          → 분모 outQty(출고량)   · 수량
 *   saleVsIn  = saleQty/inQty           → 분모 inQty(입고량)    · 수량
 *   grossRate = (salesAmt−cogs)/salesAmt→ 분모 salesAmt(매출액) · 금액
 */

import { RATIO_DENOM_MIN, type DenomUnit } from "@/lib/metric-guard";
import { type ProductNodeMetrics } from "./agg-product-tree";

export interface ProductRatioGuardSpec {
  denomField: keyof ProductNodeMetrics;
  unit: DenomUnit;
}

export const PRODUCT_RATIO_GUARD: Partial<Record<keyof ProductNodeMetrics, ProductRatioGuardSpec>> = {
  outRate: { denomField: "inQty", unit: "qty" },
  saleVsOut: { denomField: "outQty", unit: "qty" },
  saleVsIn: { denomField: "inQty", unit: "qty" },
  grossRate: { denomField: "salesAmt", unit: "amount" },
};

export function productRatioMin(field: keyof ProductNodeMetrics): number | null {
  const spec = PRODUCT_RATIO_GUARD[field];
  return spec ? RATIO_DENOM_MIN[spec.unit] : null;
}

export function productRatioDenom(
  field: keyof ProductNodeMetrics,
  metrics: ProductNodeMetrics,
): number | null | undefined {
  const spec = PRODUCT_RATIO_GUARD[field];
  if (!spec) return undefined;
  return metrics[spec.denomField] as number | null;
}
