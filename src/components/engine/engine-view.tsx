"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AggResponse,
  type DrilldownFilter,
  type FactKey,
  type TreeNode,
} from "@/lib/engine";
import { exportTreeToXlsx } from "@/lib/export-xlsx";

import { FilterBar } from "./filter-bar";
import { KpiCards } from "./kpi-cards";
import { SkuPanel } from "./sku-panel";
import { TreeTable } from "./tree-table";

/**
 * ① 물류 핵심지표 — 엔진 드릴다운 뷰 (클라이언트).
 *
 * 헤더 기간토글(URL ?period) 연동 → period_type 전환 refetch.
 * 필터(성별·신상이월·시즌·아이템) → /api/agg refetch(진입점 점프).
 * KPI 카드 · 드릴다운 트리테이블 · SKU 패널 · 엑셀 내보내기.
 */
export function EngineView() {
  const params = useSearchParams();
  const period = params.get("period") === "cumulative" ? "cumulative" : "month";
  const periodParam = period === "cumulative" ? "누적" : "당월";

  const [filter, setFilter] = useState<DrilldownFilter>({});
  const [data, setData] = useState<AggResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SKU 패널 상태.
  const [skuKey, setSkuKey] = useState<FactKey | null>(null);
  const [skuLabel, setSkuLabel] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    // setState 는 async 콜백(마이크로태스크) 안에서 — effect 본문 동기 호출 회피.
    const run = async () => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ period_type: periodParam });
      if (filter.gender) qs.set("gender", filter.gender);
      if (filter.newcarry) qs.set("newcarry", filter.newcarry);
      if (filter.season) qs.set("season", filter.season);
      if (filter.item) qs.set("item", filter.item);
      try {
        const r = await fetch(`/api/agg?${qs.toString()}`, { signal: ac.signal });
        const j: AggResponse | { ok: false; detail?: string } = await r.json();
        if (j.ok) setData(j);
        else setError(("detail" in j && j.detail) || "집계 조회 실패");
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError("네트워크 오류");
      } finally {
        setLoading(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [periodParam, filter]);

  const onLeafClick = useCallback(
    (node: TreeNode) => {
      setSkuKey(node.key);
      const k = node.key;
      const parts = [k.gender, k.newcarry, k.season, k.item].filter(Boolean);
      setSkuLabel(parts.join(" · "));
    },
    [],
  );

  const filterText = useMemo(() => {
    const parts = [filter.gender, filter.newcarry, filter.season, filter.item].filter(Boolean);
    return parts.length ? parts.join(" · ") : "전체";
  }, [filter]);

  const onExport = useCallback(() => {
    if (!data) return;
    exportTreeToXlsx(
      data.tree,
      { periodLabel: data.periodLabel, filterLabel: filterText },
      `OPR_물류핵심지표_${data.periodLabel}_${new Date().toISOString().slice(0, 10)}`,
    );
  }, [data, filterText]);

  // PPT 내보내기 — 서버에서 원본 양식 그대로 채워 다운로드(슬라이드1 전수, 필터 무관).
  const onExportPptx = useCallback(() => {
    const qs = new URLSearchParams({ period_type: periodParam });
    // 브라우저 다운로드(서버 응답 = attachment).
    window.location.assign(`/api/export/pptx?${qs.toString()}`);
  }, [periodParam]);

  return (
    <section className="mx-auto max-w-screen-2xl space-y-4">
      {/* 헤더 행 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">① 물류 핵심지표</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            시즌·아이템 엔진 드릴다운 (성별 × 신상이월 × 시즌 × 아이템) · {periodParam}
            {data && (
              <span className="ml-2 text-xs text-zinc-400">
                SKU {data.meta.skuCount.toLocaleString("ko-KR")} · 노드 {data.meta.nodeCount} · 집계 {data.meta.builtAtMs}ms
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={!data}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            ⬇ 엑셀 내보내기
          </button>
          <button
            type="button"
            onClick={onExportPptx}
            title="원본 PPT 양식 그대로 슬라이드1(물류 핵심지표)을 채워 다운로드"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            ⬇ PPT 내보내기
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
        <FilterBar filter={filter} onChange={setFilter} />
      </div>

      {/* 에러/로딩 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          데이터를 불러올 수 없습니다: {error}
          <p className="mt-1 text-xs text-red-500">
            서버가 원본 엑셀(당월/누적)을 읽지 못했을 수 있습니다. 경로·파일을 확인하세요.
          </p>
        </div>
      )}

      {/* KPI 카드 */}
      {data && <KpiCards metrics={data.tree.metrics} periodLabel={data.periodLabel} />}

      {/* 드릴다운 트리테이블 */}
      {loading && !data && (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
          집계 불러오는 중…
        </div>
      )}
      {data && <TreeTable root={data.tree} onLeafClick={onLeafClick} />}

      {/* SKU 패널 */}
      <SkuPanel
        open={skuKey !== null}
        period={period}
        itemKey={skuKey}
        label={skuLabel}
        onClose={() => setSkuKey(null)}
      />
    </section>
  );
}
