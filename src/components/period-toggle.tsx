"use client";

import { useState } from "react";

/**
 * 전역 기간 토글 (설계문서 §4-1: ●당월 ○누적).
 * 당월/누적은 99.91% 동형 → 같은 화면 + period 파라미터 교체.
 * 골격: 로컬 상태만(라우팅/쿼리 연동·값 교체는 다음 단계).
 */
export function PeriodToggle() {
  const [period, setPeriod] = useState<"month" | "cumulative">("month");

  return (
    <div className="inline-flex rounded-md border border-zinc-300 text-sm">
      <button
        type="button"
        onClick={() => setPeriod("month")}
        aria-pressed={period === "month"}
        className={[
          "px-3 py-1.5 rounded-l-md transition-colors",
          period === "month"
            ? "bg-zinc-900 text-white"
            : "bg-white text-zinc-600 hover:bg-zinc-50",
        ].join(" ")}
      >
        당월
      </button>
      <button
        type="button"
        onClick={() => setPeriod("cumulative")}
        aria-pressed={period === "cumulative"}
        className={[
          "px-3 py-1.5 rounded-r-md border-l border-zinc-300 transition-colors",
          period === "cumulative"
            ? "bg-zinc-900 text-white"
            : "bg-white text-zinc-600 hover:bg-zinc-50",
        ].join(" ")}
      >
        누적
      </button>
    </div>
  );
}
