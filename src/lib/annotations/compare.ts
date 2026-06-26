/**
 * 목표대비/전년대비 비교 — ▲▼ 방향 · 달성률 · 달성 여부.
 *
 * 근거: Slide5 "목표 대비"(목표 vs 현재 ▲▼·달성%) · 작업지시 "현재 vs 목표 ▲▼·달성%".
 *
 * 방향성(METRIC_LOWER_IS_BETTER):
 *   - 매출·입고·출고 = 높을수록 좋음 → 현재≥목표 = 달성(good).
 *   - 물류비율·재고일수·체화·물류비·반품 = 낮을수록 좋음 → 현재≤목표 = 달성(good).
 *
 * 달성률(achievedPct, 1.0 = 100%):
 *   - 정상지표(높을수록 좋음): 현재/목표.
 *   - 비용성지표(낮을수록 좋음): 목표/현재 (현재가 목표보다 낮으면 >100%).
 */

import { METRIC_LOWER_IS_BETTER, type TargetMetric } from "./types";

export interface CompareResult {
  /** 현재 − 목표(원 단위 차이, 표시는 호출부에서 포맷). */
  delta: number;
  /** 달성률(1.0 = 100%). 방향성 반영. */
  achievedPct: number;
  /** 현재가 목표보다 위/아래/같음(절대값 기준 — ▲▼ 표시). */
  direction: "up" | "down" | "flat";
  /** 목표 달성 여부(방향성 반영 — 색상: 달성=초록, 미달=빨강). */
  good: boolean;
}

/**
 * 목표(또는 전년) 대비 현재값 비교.
 * 목표가 0/null/undefined 이거나 현재가 null 이면 비교 불가(null 반환).
 */
export function compareToTarget(
  metric: string,
  current: number | null | undefined,
  target: number | null | undefined,
): CompareResult | null {
  if (current == null) return null;
  if (target == null || target === 0) return null;

  const delta = current - target;
  const direction: CompareResult["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const lowerIsBetter = isLowerBetter(metric);
  const good = lowerIsBetter ? current <= target : current >= target;
  const achievedPct = lowerIsBetter ? target / current : current / target;

  return { delta, achievedPct, direction, good };
}

/** 지표가 비용성(낮을수록 좋음)인지. 미등록 지표는 "높을수록 좋음" 기본. */
export function isLowerBetter(metric: string): boolean {
  return METRIC_LOWER_IS_BETTER[metric as TargetMetric] ?? false;
}
