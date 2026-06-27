"use client";

import type { TableDensity } from "./use-table-density";

/**
 * 밀도(조밀/보통) 토글 버튼 — 3뷰 트리테이블 컨트롤바 공통.
 *
 * UI 피드백 ①: 전체펼침/전체접힘 옆에 두어 한 화면에 더 많은 행을 볼지 선택.
 *   현재 모드를 라벨로 보이고, 클릭하면 반대 모드로 전환(상태·유지는 useTableDensity 가 담당).
 */
export function DensityToggle({
  density,
  onToggle,
}: {
  density: TableDensity;
  onToggle: () => void;
}) {
  const isCompact = density === "compact";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isCompact}
      title="행 밀도 전환 — 조밀(더 많은 행) ↔ 보통"
      className={[
        "inline-flex items-center gap-1 rounded border px-2 py-1 transition-colors",
        isCompact
          ? "border-accent bg-accent/10 text-accent"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-50",
      ].join(" ")}
    >
      <span className="text-[10px] leading-none">{isCompact ? "▤" : "▦"}</span>
      밀도: {isCompact ? "조밀" : "보통"}
    </button>
  );
}
