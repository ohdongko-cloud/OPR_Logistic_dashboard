"use client";

import {
  compareToTarget,
  TARGET_METRIC_FORMAT,
  TARGET_METRIC_LABEL,
  type NodeOverlay,
  type TargetMetric,
} from "@/lib/annotations";
import { type FactRow } from "@/lib/engine";
import { fmtDays, fmtEok, fmtPct, fmtQty } from "@/lib/format";

/**
 * 목표대비 스트립 (Slide5 "목표 대비") — 선택/루트 노드의 목표·전년·현재 비교.
 *
 * 각 카드: 지표 라벨 · 현재값(큰글씨) · 목표(있으면 ▲▼·달성%) · 전년(자동 또는 수기).
 *   달성=초록(good), 미달=빨강. 목표 미입력 지표는 표시 안 함(빈 화면 방지).
 *
 * 출력면 불변 — metrics(엔진 집계) + overlay(주석) 병합 표시만.
 */

function fmtMetric(m: TargetMetric, v: number | null | undefined): string {
  if (v == null) return "-";
  switch (TARGET_METRIC_FORMAT[m]) {
    case "pct":
      return fmtPct(v);
    case "days":
      return fmtDays(v);
    case "eok":
      return fmtEok(v);
    default:
      return fmtQty(v);
  }
}

export function TargetStrip({
  metrics,
  overlay,
  autoPriorYear,
  editable,
  onEdit,
}: {
  metrics: FactRow;
  overlay: NodeOverlay;
  /** 이 노드 전년 자동값(이력 조인). */
  autoPriorYear: Partial<Record<TargetMetric, number>>;
  /** INPUT 권한자 — 목표 설정 버튼 노출. */
  editable: boolean;
  onEdit: () => void;
}) {
  // 목표가 입력된 지표만 카드로(없으면 안내).
  const targetCodes = Object.keys(overlay.targets) as TargetMetric[];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-5 py-3.5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-zinc-700">
          목표 대비 <span className="font-normal text-zinc-400">(목표 · 전년 · 현재)</span>
        </h3>
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
          >
            ✎ 목표·비고 입력
          </button>
        )}
      </div>

      {targetCodes.length === 0 ? (
        <p className="text-[12px] text-zinc-400">
          설정된 목표가 없습니다.
          {editable ? " 우측 상단 ‘목표·비고 입력’으로 목표를 등록하세요." : " (입력 권한자가 목표를 등록하면 표시됩니다.)"}
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          {targetCodes.map((code) => {
            const cur = (metrics[code] as number | null) ?? null;
            const target = overlay.targets[code];
            const cmp = compareToTarget(code, cur, target);
            // 전년 = 수기 우선, 없으면 자동.
            const prevManual = overlay.priorYearManual[code];
            const prevAuto = autoPriorYear[code];
            const prev = prevManual ?? prevAuto;
            const prevSource = prevManual != null ? "수기" : prevAuto != null ? "자동" : null;

            return (
              <div key={code} className="min-w-[140px]">
                <div className="text-[11px] text-zinc-400">{TARGET_METRIC_LABEL[code]}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="tabnum text-[20px] font-semibold leading-none text-zinc-800">
                    {fmtMetric(code, cur)}
                  </span>
                  {cmp && (
                    <span
                      className={[
                        "tabnum text-[12px] font-medium",
                        cmp.good ? "text-good" : "text-bad",
                      ].join(" ")}
                      title={`목표 ${fmtMetric(code, target)} 대비`}
                    >
                      {cmp.direction === "up" ? "▲" : cmp.direction === "down" ? "▼" : "▬"}
                      {Math.round(cmp.achievedPct * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 text-[10.5px] text-zinc-400">
                  <div>목표 {fmtMetric(code, target)}</div>
                  {prev != null && (
                    <div>
                      전년 {fmtMetric(code, prev)}
                      <span className="ml-1 text-zinc-300">({prevSource})</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 비고·조치(있으면) */}
      {(overlay.remark || overlay.action) && (
        <div className="mt-3 space-y-1 border-t border-zinc-100 pt-2.5 text-[12px]">
          {overlay.remark && (
            <p className="text-zinc-600">
              <span className="mr-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">비고</span>
              {overlay.remark}
            </p>
          )}
          {overlay.action && (
            <p className="text-zinc-600">
              <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">조치</span>
              {overlay.action}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
