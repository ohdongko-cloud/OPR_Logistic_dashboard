"use client";

import { type DrilldownFilter } from "@/lib/engine";

/** 필터 도메인(설계 §4-2 — ① 뷰 가용 차원). */
const GENDERS = ["여성", "남성", "아동"];
const NEWCARRIES = ["신상", "이월"];
const SEASONS = ["봄", "여름", "가을", "겨울", "공통"];
const ITEMS = ["상의류", "하의류", "액티브", "명품류", "잡화류", "내의류", "아동복"];

/**
 * 필터 바 (설계 §4-2: 성별·신상이월·시즌·아이템).
 * 선택 = 트리 진입점 점프(상위 차원 고정). 전체="" .
 */
export function FilterBar({
  filter,
  onChange,
}: {
  filter: DrilldownFilter;
  onChange: (next: DrilldownFilter) => void;
}) {
  const set = (k: keyof DrilldownFilter, v: string) =>
    onChange({ ...filter, [k]: v || undefined });

  const reset = () => onChange({});
  const hasAny = Boolean(filter.gender || filter.newcarry || filter.season || filter.item);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-medium text-zinc-500">필터:</span>
      <Select label="성별" value={filter.gender ?? ""} options={GENDERS} onChange={(v) => set("gender", v)} />
      <Select label="신상/이월" value={filter.newcarry ?? ""} options={NEWCARRIES} onChange={(v) => set("newcarry", v)} />
      <Select label="시즌" value={filter.season ?? ""} options={SEASONS} onChange={(v) => set("season", v)} />
      <Select label="아이템" value={filter.item ?? ""} options={ITEMS} onChange={(v) => set("item", v)} />
      {hasAny && (
        <button
          type="button"
          onClick={reset}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          초기화
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
