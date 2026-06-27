/**
 * 매장(store) 뷰 비율 가드 매핑 — 파생 비율필드 → 분모·단위.
 *
 * 분모 출처 = StoreNodeMetrics 산식(spec 매장 §4) — ★행종류(집계 vs 직영/점포) 분기 인지형:
 *   saleMult  = AA/W  → 분모 inQtyAll(전체입고량)        · 수량(정적)
 *   dotsDays  = V/O or AI/AD → 분모 일평균매출원가(carry dotsDaysDenom) · 금액
 *                 (집계=AD=cogsAll/C1 · 직영/점포=O=cogsFix/C1 — stage2 가 실분모를 carry)
 *   seasonPct = O/T or O/P → 분모 재고'량'(carry seasonPctDenom)        · 수량
 *                 (집계=invQtyAll · 직영/점포=invQtyFix — 산식이 수량이라 단위=qty)
 *   stockRatio= T/I or P/I → 분모 baseInvQty(기준재고량)  · 수량(정적)
 *
 * 변경 이력: dotsDays/seasonPct 분모를 고정 컬럼(cogsFix/invAmtFix)에서 stage2 carry 실분모로
 *   교정 — 집계행에서 cogsFix·invAmtFix 가 실제 나눗셈 분모와 달라 오판(과잉보류/희소통과)하던 결함.
 *   seasonPct 는 단위도 amount→qty 교정(산식이 Q/S 금액이 아니라 summerInvQty/invQty 수량).
 */

import { RATIO_DENOM_MIN, type DenomUnit } from "@/lib/metric-guard";
import { type StoreNodeMetrics } from "./agg-store-tree";

/** 분모 해결자 — 정적 컬럼 또는 carry 분모(함수). 단위는 임계 선택에 사용. */
export interface StoreRatioGuardSpec {
  /** 정적 분모 컬럼(분기 없는 비율). */
  denomField?: keyof StoreNodeMetrics;
  /** 행종류 분기 분모(carry) — metrics 에서 실분모를 함수로 선택. */
  denomOf?: (m: StoreNodeMetrics) => number | null;
  unit: DenomUnit;
}

export const STORE_RATIO_GUARD: Partial<Record<keyof StoreNodeMetrics, StoreRatioGuardSpec>> = {
  saleMult: { denomField: "inQtyAll", unit: "qty" }, // AA/W (분기 없음)
  // 재고일수 분모 = 일평균매출원가(집계=AD · 직영/점포=O) — carry 실분모, 금액 임계.
  dotsDays: { denomOf: (m) => m.dotsDaysDenom, unit: "amount" },
  // 시즌비중 분모 = 재고'량'(집계=T · 직영/점포=P) — carry 실분모, 수량 임계.
  seasonPct: { denomOf: (m) => m.seasonPctDenom, unit: "qty" },
  stockRatio: { denomField: "baseInvQty", unit: "qty" }, // P/I or T/I (분기는 stockRatio 값 자체에 반영, 분모키는 동일 baseInvQty)
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
  if (spec.denomOf) return spec.denomOf(metrics);
  return metrics[spec.denomField!] as number | null;
}
