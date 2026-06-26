"use client";

import { type ProductNodeMetrics } from "@/lib/engine-product";
import { fmtPct, fmtQty } from "@/lib/format";

/**
 * 상품 KPI 요약 스트립(레퍼런스 BI 양식 — 상단 가로 일렬).
 *
 * 항목 = 자동 8필드 中 전체 요약 핵심: 입고량 · 재고량 · 누적출고량 · 누적출고율 ·
 *   누적판매량 · 입고비판매율 · 누적매총율. 값 = 루트(전체/브랜드 필터요약) 집계.
 */
export function ProductKpiStrip({
  metrics,
  periodLabel,
  filterLabel,
}: {
  metrics: ProductNodeMetrics;
  periodLabel: string;
  filterLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3 rounded-lg border border-zinc-200 bg-white px-5 py-3.5">
      <Kpi label="입고량" value={fmtQty(metrics.inQty)} />
      <Kpi label="재고량" value={fmtQty(metrics.invQty)} />
      <Kpi label="누적출고량" value={fmtQty(metrics.outQty)} />
      <Kpi label="누적출고율" value={fmtPct(metrics.outRate)} accent />
      <Kpi label="누적판매량" value={fmtQty(metrics.saleQty)} />
      <Kpi label="입고비판매율" value={fmtPct(metrics.saleVsIn)} accent />
      <Kpi label="누적매총율" value={fmtPct(metrics.grossRate)} />

      <div className="ml-auto flex flex-col justify-center border-l border-zinc-100 pl-6 text-right">
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">스냅샷</span>
        <span className="text-[13px] font-medium text-zinc-600">{periodLabel} 기준</span>
        <span className="max-w-[200px] truncate text-[10px] text-zinc-400" title={filterLabel}>
          {filterLabel}
        </span>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-[80px] flex-col justify-center">
      <span className="text-[11px] leading-tight text-zinc-400">{label}</span>
      <span
        className={[
          "tabnum mt-0.5 text-[21px] font-semibold leading-none",
          accent ? "text-accent" : "text-zinc-800",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
