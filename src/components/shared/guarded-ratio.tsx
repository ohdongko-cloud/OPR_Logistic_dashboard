"use client";

/**
 * 가드된 비율 셀 표시 — 희소 분모면 "—"(흐림) + 툴팁, 아니면 포맷값.
 *
 * 3뷰(engine·store·product) tree-table·KPI 공통 포맷 헬퍼(작업지시 ②-B "적용 일관성").
 * 원본 값은 가드 모듈에서 보존(손실 없음) — 표시만 보류.
 */

import { guardRatio, SUPPRESS_REASON } from "@/lib/metric-guard";

/**
 * 가드 결과 텍스트(문자열). 보류면 "—".
 * @param fmt 정상값 포맷터(fmtPct·fmtDays·fmtMult 등).
 */
export function guardedText(
  ratio: number | null,
  denom: number | null | undefined,
  min: number | null,
  fmt: (v: number | null) => string,
): { text: string; suppressed: boolean; reason?: string } {
  // 가드 대상 아님(min=null) → 그대로 포맷.
  if (min == null) return { text: fmt(ratio), suppressed: false };
  const g = guardRatio(ratio, denom, min);
  if (g.suppressed) return { text: "—", suppressed: true, reason: g.reason ?? SUPPRESS_REASON };
  return { text: fmt(g.value), suppressed: false };
}

/**
 * 가드 셀 span — 보류면 흐린 회색 + cursor-help + title 툴팁.
 * 비가드/정상은 children(부모가 톤·정렬 적용) 그대로.
 */
export function GuardedRatioSpan({
  ratio,
  denom,
  min,
  fmt,
}: {
  ratio: number | null;
  denom: number | null | undefined;
  min: number | null;
  fmt: (v: number | null) => string;
}) {
  const g = guardedText(ratio, denom, min, fmt);
  if (!g.suppressed) return <>{g.text}</>;
  return (
    <span className="cursor-help text-zinc-300" title={g.reason}>
      {g.text}
    </span>
  );
}
