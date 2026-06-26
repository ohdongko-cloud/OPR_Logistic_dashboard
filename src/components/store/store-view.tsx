"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  flattenStoreAggTree,
  STORE_COL_GROUPS,
  type StoreChannel,
  type StoreTreeNodeDto,
} from "@/lib/engine-store";
import { exportStoreTreeToXlsx } from "@/lib/export-store-xlsx";
import { Topbar } from "@/components/shell/topbar";

import { StoreKpiStrip } from "./store-kpi-strip";
import { StoreTreeTable } from "./store-tree-table";

/** /api/store-agg 응답. */
interface StoreAggResponse {
  ok: true;
  view: "store";
  period: "MONTH" | "CUMULATIVE";
  periodLabel: string;
  filter: { channel?: StoreChannel };
  tree: StoreTreeNodeDto;
  meta: { storeCount: number; nodeCount: number; builtAtMs: number; source: "db" | "livefile" };
}

const CHANNELS: StoreChannel[] = ["직영", "중간관리", "기타"];

/**
 * ② 매장 SCM — 점포(채널) 단위 드릴다운 뷰(레퍼런스 BI 양식).
 *
 * 레이아웃: Topbar(당월 고정·누적 비활성) → KPI 스트립 → 채널 필터/검색/엑셀 → 3단 트리테이블.
 * /api/store-agg 계약 불변. 전체→채널→점포 드릴다운, (−)재고 경고, 엑셀 내보내기.
 */
export function StoreView() {
  const params = useSearchParams();
  // 매장은 당월만 — period=cumulative 가 들어와도 당월로 강제(서버 503 회피).
  const periodParam = "당월";

  const [channel, setChannel] = useState<StoreChannel | "">("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<StoreAggResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ period_type: periodParam });
      if (channel) qs.set("channel", channel);
      try {
        const r = await fetch(`/api/store-agg?${qs.toString()}`, { signal: ac.signal });
        const j: StoreAggResponse | { ok: false; detail?: string } = await r.json();
        if (j.ok) setData(j);
        else setError(("detail" in j && j.detail) || "매장 집계 조회 실패");
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError("네트워크 오류");
      } finally {
        setLoading(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [channel]);

  // period 파라미터가 cumulative 면 안내(매장 당월 전용).
  const cumulativeRequested = params.get("period") === "cumulative";

  const filterText = useMemo(() => (channel ? channel : "전체 채널"), [channel]);

  const onExport = useCallback(() => {
    if (!data) return;
    const flat = flattenStoreAggTree(data.tree);
    exportStoreTreeToXlsx(
      flat,
      { periodLabel: data.periodLabel, filterLabel: filterText },
      `OPR_매장SCM_${data.periodLabel}_${new Date().toISOString().slice(0, 10)}`,
    );
  }, [data, filterText]);

  return (
    <>
      <Topbar title="매장 SCM — 점포·채널" subtitle="전체 → 채널(직영·중간관리·기타) → 점포 드릴다운" periodLocked />

      <div className="flex-1 space-y-3 overflow-auto p-5">
        {cumulativeRequested && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-700">
            매장 SCM 은 <b>당월</b> 데이터만 제공됩니다(누적본 미동봉). 당월 기준으로 표시합니다.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            데이터를 불러올 수 없습니다: {error}
            <p className="mt-1 text-xs text-red-500">
              서버가 매장 원본 엑셀(당월)을 읽지 못했을 수 있습니다. 경로·파일을 확인하세요.
            </p>
          </div>
        )}

        {data && (
          <StoreKpiStrip
            metrics={data.tree.metrics}
            periodLabel={data.periodLabel}
            filterLabel={filterText}
          />
        )}

        {/* 채널 필터 + 검색 + 엑셀 */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]">
          <span className="text-[11px] font-medium text-zinc-400">채널</span>
          <ChannelChip label="전체" active={channel === ""} onClick={() => setChannel("")} />
          {CHANNELS.map((c) => (
            <ChannelChip key={c} label={c} active={channel === c} onClick={() => setChannel(c)} />
          ))}
          <div className="relative ml-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="점포 검색 (이름·코드)"
              className="w-48 rounded-md border border-zinc-300 bg-white py-1 pl-7 pr-2 text-[12px] text-zinc-700 placeholder:text-zinc-400 focus:border-accent focus:outline-none"
            />
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">⌕</span>
          </div>
          <button
            type="button"
            onClick={onExport}
            disabled={!data}
            className="ml-auto rounded-md border border-zinc-300 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            ⬇ 엑셀
          </button>
        </div>

        {data && (
          <p className="text-[11px] text-zinc-400">
            점포 {data.meta.storeCount} · 노드 {data.meta.nodeCount} · 집계 {data.meta.builtAtMs}ms ·{" "}
            {data.periodLabel} · 출처 {data.meta.source === "db" ? "DB" : "라이브파일"}
          </p>
        )}

        {loading && !data && (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
            매장 집계 불러오는 중…
          </div>
        )}

        {data && <StoreTreeTable root={data.tree} query={query} />}

        {/* 컬럼 범례(엑셀 추적) */}
        {data && (
          <p className="text-[10px] text-zinc-300">
            컬럼 그룹:{" "}
            {STORE_COL_GROUPS.map((g) => g.title).join(" · ")}
          </p>
        )}
      </div>
    </>
  );
}

function ChannelChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
        active ? "bg-accent text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
