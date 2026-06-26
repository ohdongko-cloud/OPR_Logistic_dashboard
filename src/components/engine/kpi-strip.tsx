"use client";

import { type FactRow } from "@/lib/engine";
import { CRITICAL_THRESHOLDS } from "@/lib/engine";
import { fmtDays, fmtEok, fmtPct, fmtQty } from "@/lib/format";

/**
 * KPI 요약 스트립 (레퍼런스 BI 양식 — 상단 가로 일렬 숫자 묶음).
 *
 * 각 항목 = 작은 회색 라벨(위) + 큰 숫자(아래). 핵심은 파랑/강조, 위험은 빨강.
 * 항목: 매출 · 물류비율 · 센터재고일수 · 입고량 · 출고량 · 반품량 · 센터체화비중.
 * 우측 끝 = 스냅샷 기간(보조).
 *
 * 값은 루트(전체/필터 요약) 집계 — /api/agg tree.metrics 그대로.
 */
export function KpiStrip({
  metrics,
  periodLabel,
  filterLabel,
}: {
  metrics: FactRow;
  periodLabel: string;
  filterLabel: string;
}) {
  const ratioWarn = (metrics.logiRatio ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh;
  const daysWarn = (metrics.dotsCtr ?? 0) >= CRITICAL_THRESHOLDS.daysHigh;
  const deadWarn = (metrics.deadCtrPct ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh;

  return (
    <div className="flex flex-wrap items-stretch gap-x-7 gap-y-3 rounded-lg border border-zinc-200 bg-white px-5 py-3.5">
      <Kpi label="매출 (실매출 추정)" value={fmtEok(metrics.sales)} accent />
      <Kpi label="물류비율" value={fmtPct(metrics.logiRatio)} warn={ratioWarn} />
      <Kpi label="센터 재고일수" value={fmtDays(metrics.dotsCtr)} warn={daysWarn} />
      <Kpi label="입고량" value={fmtQty(metrics.inQty)} />
      <Kpi label="출고량" value={fmtQty(metrics.outQty)} />
      <Kpi label="반품량" value={fmtQty(metrics.retQty)} />
      <Kpi label="센터체화비중" value={fmtPct(metrics.deadCtrPct)} warn={deadWarn} />

      {/* 우측 끝 보조: 스냅샷 기간/필터 */}
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
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex min-w-[84px] flex-col justify-center">
      <span className="text-[11px] leading-tight text-zinc-400">{label}</span>
      <span
        className={[
          "tabnum mt-0.5 text-[22px] font-semibold leading-none",
          warn ? "text-bad" : accent ? "text-accent" : "text-zinc-800",
        ].join(" ")}
      >
        {value}
        {warn && <span className="ml-1 align-top text-[12px]">⚠</span>}
      </span>
    </div>
  );
}
