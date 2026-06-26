"use client";

import { type FactRow } from "@/lib/engine";
import { fmtDays, fmtEok, fmtPct } from "@/lib/format";
import { CRITICAL_THRESHOLDS } from "@/lib/engine";

/**
 * ① 뷰 KPI 카드 5종 (설계 §4-3).
 *   물류비율(E3/G) · 센터재고일수(E5/I) · 판매배수★ · (−)마이너스재고 · 센터체화비중(E23/AK).
 *
 * 현재 선택 노드(루트=전체 또는 필터/드릴 노드) 기준 값.
 * - 판매배수·(−)재고는 매장뷰(②) 소관(엔진엔 없음) → 설계 §7 Q8 미확정.
 *   v1 데모는 "엔진 미보유 — 매장 SCM" 안내로 자리 표시(가짜수치 금지).
 */
export function KpiCards({ metrics, periodLabel }: { metrics: FactRow; periodLabel: string }) {
  const ratioWarn = (metrics.logiRatio ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh;
  const daysWarn = (metrics.dotsCtr ?? 0) >= CRITICAL_THRESHOLDS.daysHigh;
  const deadWarn = (metrics.deadCtrPct ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="물류비율" value={fmtPct(metrics.logiRatio)} sub={`E3 · 물류비÷실매출 (${periodLabel})`} warn={ratioWarn} />
      <Card label="센터재고일수" value={fmtDays(metrics.dotsCtr)} sub="E5 · 평균재고(물류)÷소진" warn={daysWarn} />
      <Card
        label="판매배수"
        value="—"
        sub="M1 · 매장 SCM 지표 (엔진 미보유)"
        muted
      />
      <Card
        label="(−)마이너스재고"
        value="—"
        sub="M10 · 매장 SCM 수불오차 (엔진 미보유)"
        muted
      />
      <Card label="센터체화비중" value={fmtPct(metrics.deadCtrPct)} sub="E23 · 체화액÷센터재고액" warn={deadWarn} />
      <div className="col-span-full -mt-1 text-[11px] text-zinc-400">
        실매출 {fmtEok(metrics.sales)} · 물류비 {fmtEok(metrics.logiCost)} · 총기말재고 {fmtEok(metrics.invAmtTotal)}
        {"  "}(판매배수·(−)재고는 ② 매장 SCM 뷰 소관 — 설계 §7 Q8)
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  warn,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-4",
        muted
          ? "border-dashed border-zinc-200 bg-zinc-50"
          : warn
            ? "border-red-300 bg-red-50"
            : "border-zinc-200 bg-white",
      ].join(" ")}
    >
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div
        className={[
          "mt-1 text-2xl font-semibold tabular-nums",
          muted ? "text-zinc-400" : warn ? "text-red-600" : "text-zinc-900",
        ].join(" ")}
      >
        {value}
        {warn && <span className="ml-1 align-middle text-sm">⚠</span>}
      </div>
      <div className="mt-1 text-[11px] text-zinc-400">{sub}</div>
    </div>
  );
}
