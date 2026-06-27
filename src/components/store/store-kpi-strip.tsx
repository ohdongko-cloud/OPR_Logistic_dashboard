"use client";

import {
  storeRatioDenom,
  storeRatioMin,
  STORE_CRITICAL_THRESHOLDS,
  type StoreNodeMetrics,
} from "@/lib/engine-store";
import { fmtDays, fmtEok, fmtMult, fmtPct, fmtQty } from "@/lib/format";
import { guardedText } from "@/components/shared/guarded-ratio";

/**
 * 매장 KPI 요약 스트립(레퍼런스 BI 양식 — 상단 가로 일렬).
 *
 * 항목: 판매배수 · 재고일수 · 시즌비중 · 재고보유율 · (−)마이너스재고(수량·금액).
 * 값 = 루트(전체/채널 필터요약) 집계 — /api/store-agg tree.metrics.
 * (−)재고는 음수면 빨강 경고(재고건전성 핵심 KPI).
 */
export function StoreKpiStrip({
  metrics,
  periodLabel,
  filterLabel,
}: {
  metrics: StoreNodeMetrics;
  periodLabel: string;
  filterLabel: string;
}) {
  // 희소 분모 가드(판매배수·재고일수·시즌비중·재고보유율).
  const multG = guardedText(metrics.saleMult, storeRatioDenom("saleMult", metrics), storeRatioMin("saleMult"), fmtMult);
  const daysG = guardedText(metrics.dotsDays, storeRatioDenom("dotsDays", metrics), storeRatioMin("dotsDays"), fmtDays);
  const seasonG = guardedText(metrics.seasonPct, storeRatioDenom("seasonPct", metrics), storeRatioMin("seasonPct"), fmtPct);
  const stockG = guardedText(metrics.stockRatio, storeRatioDenom("stockRatio", metrics), storeRatioMin("stockRatio"), fmtMult);

  const daysWarn = !daysG.suppressed && (metrics.dotsDays ?? 0) >= STORE_CRITICAL_THRESHOLDS.daysHigh;
  const negWarn = (metrics.negAmt ?? 0) < 0;
  const multLow =
    !multG.suppressed &&
    metrics.saleMult != null && metrics.saleMult > 0 && metrics.saleMult < STORE_CRITICAL_THRESHOLDS.multLow;

  return (
    <div className="flex flex-wrap items-stretch gap-x-7 gap-y-3 rounded-lg border border-zinc-200 bg-white px-5 py-3.5">
      <Kpi label="판매배수" value={multG.text} warn={multLow} accent={!multG.suppressed} muted={multG.suppressed} tip={multG.reason} />
      <Kpi label="재고일수" value={daysG.text} warn={daysWarn} muted={daysG.suppressed} tip={daysG.reason} />
      <Kpi label="시즌비중(여름)" value={seasonG.text} muted={seasonG.suppressed} tip={seasonG.reason} />
      <Kpi label="재고보유율" value={stockG.text} muted={stockG.suppressed} tip={stockG.reason} />
      <Kpi label="(−)재고 수량" value={fmtQty(metrics.negQty)} warn={(metrics.negQty ?? 0) < 0} />
      <Kpi label="(−)재고 금액" value={fmtEok(metrics.negAmt)} warn={negWarn} />

      <div className="ml-auto flex flex-col justify-center border-l border-zinc-100 pl-7 text-right">
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">스냅샷</span>
        <span className="text-[13px] font-medium text-zinc-600">{periodLabel} 기준</span>
        <span className="max-w-[200px] truncate text-[10px] text-zinc-400" title={filterLabel}>
          {filterLabel}
        </span>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  warn,
  muted,
  tip,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  muted?: boolean;
  tip?: string;
}) {
  return (
    <div className="flex min-w-[84px] flex-col justify-center">
      <span className="text-[11px] leading-tight text-zinc-400">{label}</span>
      <span
        className={[
          "tabnum mt-0.5 text-[22px] font-semibold leading-none",
          muted ? "cursor-help text-zinc-300" : warn ? "text-bad" : accent ? "text-accent" : "text-zinc-800",
        ].join(" ")}
        title={muted ? tip : undefined}
      >
        {value}
        {warn && <span className="ml-1 align-top text-[12px]">⚠</span>}
      </span>
    </div>
  );
}
