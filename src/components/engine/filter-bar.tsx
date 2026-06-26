"use client";

import { useState } from "react";

import { type DrilldownFilter } from "@/lib/engine";

/** 필터 도메인(설계 §4-2 — ① 뷰 가용 차원). */
const GENDERS = ["여성", "남성", "아동"];
const NEWCARRIES = ["신상", "이월"];
const SEASONS = ["봄", "여름", "가을", "겨울", "공통"];
const ITEMS = ["상의류", "하의류", "액티브", "명품류", "잡화류", "내의류", "아동복"];

/**
 * 필터 바 (레퍼런스 BI 양식 — 흰 배경·얇은 보더·조밀).
 *
 * 드롭다운: 성별 · 신상/이월 · 시즌 · 아이템 + 검색 인풋 + "적용" 버튼.
 * 드롭다운/검색은 draft 로 쌓고 "적용" 시 한 번에 커밋 →
 *   - DrilldownFilter(성별·신상이월·시즌·아이템)는 /api/agg 쿼리파라미터로 refetch(진입점 점프).
 *   - query(검색어)는 트리 행 라벨 클라이언트 필터(부모 경로 보존).
 */
export function FilterBar({
  filter,
  query,
  onApply,
}: {
  filter: DrilldownFilter;
  query: string;
  onApply: (next: DrilldownFilter, query: string) => void;
}) {
  const [draft, setDraft] = useState<DrilldownFilter>(filter);
  const [q, setQ] = useState(query);
  // 커밋된 prop(초기화·외부변경)과 draft 동기화 — 렌더 중 조정(effect setState 회피).
  const [syncKey, setSyncKey] = useState({ filter, query });
  if (syncKey.filter !== filter || syncKey.query !== query) {
    setSyncKey({ filter, query });
    setDraft(filter);
    setQ(query);
  }

  const set = (k: keyof DrilldownFilter, v: string) =>
    setDraft((prev) => ({ ...prev, [k]: v || undefined }));

  const apply = () => onApply(draft, q.trim());
  const reset = () => {
    setDraft({});
    setQ("");
    onApply({}, "");
  };

  const hasAny =
    Boolean(draft.gender || draft.newcarry || draft.season || draft.item) || q.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
    >
      <span className="text-[11px] font-medium text-zinc-400">필터</span>
      <Select label="성별" value={draft.gender ?? ""} options={GENDERS} onChange={(v) => set("gender", v)} />
      <Select label="신상/이월" value={draft.newcarry ?? ""} options={NEWCARRIES} onChange={(v) => set("newcarry", v)} />
      <Select label="시즌" value={draft.season ?? ""} options={SEASONS} onChange={(v) => set("season", v)} />
      <Select label="아이템" value={draft.item ?? ""} options={ITEMS} onChange={(v) => set("item", v)} />

      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="행 검색 (라벨)"
          className="w-40 rounded-md border border-zinc-300 bg-white py-1 pl-7 pr-2 text-[12px] text-zinc-700 placeholder:text-zinc-400 focus:border-accent focus:outline-none"
        />
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
          ⌕
        </span>
      </div>

      <button
        type="submit"
        className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700"
      >
        적용
      </button>
      {hasAny && (
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-[12px] text-zinc-600 hover:bg-zinc-50"
        >
          초기화
        </button>
      )}
    </form>
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
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[12px] text-zinc-700 focus:border-accent focus:outline-none"
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
