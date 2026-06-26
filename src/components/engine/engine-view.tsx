"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AggResponse,
  type DrilldownFilter,
  type FactKey,
  type TreeNode,
} from "@/lib/engine";
import {
  buildAnnotationOverlay,
  nodeOverlayFor,
  type AnnotationDto,
  type AnnotationOverlay,
  type TargetMetric,
} from "@/lib/annotations";
import { exportTreeToXlsx } from "@/lib/export-xlsx";

import { AnnotationPanel } from "./annotation-panel";
import { FilterBar } from "./filter-bar";
import { KpiStrip } from "./kpi-strip";
import { SkuPanel } from "./sku-panel";
import { TargetStrip } from "./target-strip";
import { Topbar } from "@/components/shell/topbar";
import { TreeTable } from "./tree-table";

/** /api/annotations GET 응답(옵셔널 — 출력면 불변, 오버레이 레이어). */
interface AnnotationsPayload {
  annotations: AnnotationDto[];
  autoPriorYear: Record<string, Partial<Record<TargetMetric, number>>>;
}

/**
 * ① 물류 핵심지표 — 엔진 드릴다운 뷰 (레퍼런스 BI 양식 리워크).
 *
 * 레이아웃: Topbar(타이틀·기간칩·로그아웃) → KPI 스트립 → 필터바 → 액션행 → 조밀 트리테이블.
 * 엔진/`/api/agg` 계약 불변 — 표현(UI)만 리워크. 당월/누적·SKU 모달·엑셀/PPT 내보내기 유지.
 */
export function EngineView() {
  const params = useSearchParams();
  const period = params.get("period") === "cumulative" ? "cumulative" : "month";
  const periodParam = period === "cumulative" ? "누적" : "당월";

  const [filter, setFilter] = useState<DrilldownFilter>({});
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AggResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  // SKU 패널 상태.
  const [skuKey, setSkuKey] = useState<FactKey | null>(null);
  const [skuLabel, setSkuLabel] = useState("");

  // 입력면(주석) 상태.
  const [anno, setAnno] = useState<AnnotationsPayload | null>(null);
  const [canInput, setCanInput] = useState(false);
  const [editNode, setEditNode] = useState<TreeNode | null>(null);
  const [annoReload, setAnnoReload] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
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
        if (j.ok) {
          setData(j);
          setShowToast(true);
        } else {
          setError(("detail" in j && j.detail) || "집계 조회 실패");
        }
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError("네트워크 오류");
      } finally {
        setLoading(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [periodParam, filter]);

  // 입력면 권한(canInput) 1회 조회 — UI 게이트(실제 강제는 서버 guardTab).
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/me", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCanInput(Boolean(j?.canInput)))
      .catch(() => setCanInput(false));
    return () => ac.abort();
  }, []);

  // 주석(목표·전년·비고) 조회 — 기간 변경·저장 시 재조회. 출력면과 독립(실패해도 집계는 표시).
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/annotations?period_type=${encodeURIComponent(periodParam)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) setAnno({ annotations: j.annotations, autoPriorYear: j.autoPriorYear });
        else setAnno({ annotations: [], autoPriorYear: {} });
      })
      .catch(() => setAnno({ annotations: [], autoPriorYear: {} }));
    return () => ac.abort();
  }, [periodParam, annoReload]);

  // 토스트 자동 사라짐.
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 2600);
    return () => clearTimeout(t);
  }, [showToast]);

  const onLeafClick = useCallback((node: TreeNode) => {
    setSkuKey(node.key);
    const k = node.key;
    const parts = [k.gender, k.newcarry, k.season, k.item].filter(Boolean);
    setSkuLabel(parts.join(" · "));
  }, []);

  const filterText = useMemo(() => {
    const parts = [filter.gender, filter.newcarry, filter.season, filter.item].filter(Boolean);
    return parts.length ? parts.join(" · ") : "전체";
  }, [filter]);

  // 주석 오버레이(노드키 색인) — 트리·KPI 병합용.
  const overlay: AnnotationOverlay = useMemo(
    () => buildAnnotationOverlay(anno?.annotations ?? []),
    [anno],
  );

  // 루트(전체/필터요약) 노드의 오버레이·전년자동값.
  const rootKey = data?.tree.key ?? null;
  const rootOverlay = useMemo(
    () => (rootKey ? nodeOverlayFor(overlay, rootKey) : { targets: {}, priorYearManual: {} }),
    [overlay, rootKey],
  );
  const rootAutoPrev = useMemo(() => {
    if (!rootKey || !anno) return {};
    const parts = [rootKey.gender, rootKey.newcarry, rootKey.season, rootKey.item].filter(Boolean);
    const ser = parts.length === 0 ? "ROOT" : [rootKey.gender, rootKey.newcarry, rootKey.season, rootKey.item].join("|");
    return anno.autoPriorYear[ser] ?? {};
  }, [rootKey, anno]);

  // 편집 대상 노드의 기존 주석·전년자동값(패널 초기화용).
  const editExisting = useMemo(() => {
    if (!editNode) return [];
    const k = editNode.key;
    return (anno?.annotations ?? []).filter(
      (a) =>
        (a.gender ?? "") === (k.gender ?? "") &&
        (a.newcarry ?? "") === (k.newcarry ?? "") &&
        (a.season ?? "") === (k.season ?? "") &&
        (a.item ?? "") === (k.item ?? ""),
    );
  }, [editNode, anno]);
  const editAutoPrev = useMemo(() => {
    if (!editNode || !anno) return {};
    const k = editNode.key;
    const parts = [k.gender, k.newcarry, k.season, k.item].filter(Boolean);
    const ser = parts.length === 0 ? "ROOT" : [k.gender, k.newcarry, k.season, k.item].join("|");
    return anno.autoPriorYear[ser] ?? {};
  }, [editNode, anno]);

  const onApplyFilter = useCallback((next: DrilldownFilter, q: string) => {
    setFilter(next);
    setQuery(q);
  }, []);

  const onExport = useCallback(() => {
    if (!data) return;
    exportTreeToXlsx(
      data.tree,
      { periodLabel: data.periodLabel, filterLabel: filterText },
      `OPR_물류핵심지표_${data.periodLabel}_${new Date().toISOString().slice(0, 10)}`,
    );
  }, [data, filterText]);

  const onExportPptx = useCallback(() => {
    const qs = new URLSearchParams({ period_type: periodParam });
    window.location.assign(`/api/export/pptx?${qs.toString()}`);
  }, [periodParam]);

  return (
    <>
      <Topbar title="물류 핵심지표 — 시즌·아이템" subtitle="시즌 × 아이템 엔진 드릴다운" />

      <div className="flex-1 space-y-3 overflow-auto p-5">
        {/* 에러 */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            데이터를 불러올 수 없습니다: {error}
            <p className="mt-1 text-xs text-red-500">
              서버가 원본 엑셀(당월/누적)을 읽지 못했을 수 있습니다. 경로·파일을 확인하세요.
            </p>
          </div>
        )}

        {/* KPI 요약 스트립 */}
        {data && (
          <KpiStrip
            metrics={data.tree.metrics}
            periodLabel={data.periodLabel}
            filterLabel={filterText}
          />
        )}

        {/* 목표 대비(Slide5) — 루트/필터 노드 목표·전년·현재 + 입력 진입 */}
        {data && (
          <TargetStrip
            metrics={data.tree.metrics}
            overlay={rootOverlay}
            autoPriorYear={rootAutoPrev}
            editable={canInput}
            onEdit={() => setEditNode(data.tree)}
          />
        )}

        {/* 필터바 + 내보내기 액션 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[280px]">
            <FilterBar filter={filter} query={query} onApply={onApplyFilter} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={!data}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              ⬇ 엑셀
            </button>
            <button
              type="button"
              onClick={onExportPptx}
              title="원본 PPT 양식 그대로 슬라이드1(물류 핵심지표)을 채워 다운로드"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ⬇ PPT
            </button>
          </div>
        </div>

        {/* 메타(증거·진단) */}
        {data && (
          <p className="text-[11px] text-zinc-400">
            SKU {data.meta.skuCount.toLocaleString("ko-KR")} · 노드 {data.meta.nodeCount} · 집계{" "}
            {data.meta.builtAtMs}ms · {periodParam}
          </p>
        )}

        {/* 로딩 */}
        {loading && !data && (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
            집계 불러오는 중…
          </div>
        )}

        {/* 메인 테이블 */}
        {data && (
          <TreeTable
            root={data.tree}
            query={query}
            onLeafClick={onLeafClick}
            overlay={overlay}
            canInput={canInput}
            onEditNode={(node) => setEditNode(node)}
          />
        )}
      </div>

      {/* SKU 패널 */}
      <SkuPanel
        open={skuKey !== null}
        period={period}
        itemKey={skuKey}
        label={skuLabel}
        onClose={() => setSkuKey(null)}
      />

      {/* 입력면 패널(목표·전년·비고·조치) — INPUT 권한자만 진입 */}
      <AnnotationPanel
        open={editNode !== null && canInput}
        nodeKey={editNode?.key ?? null}
        nodeLabel={editNode?.label ?? ""}
        metrics={editNode?.metrics ?? null}
        periodType={period === "cumulative" ? "CUMULATIVE" : "MONTH"}
        existing={editExisting}
        autoPriorYear={editAutoPrev}
        onSaved={() => setAnnoReload((n) => n + 1)}
        onClose={() => setEditNode(null)}
      />

      {/* 토스트(데이터 연동 완료) */}
      {showToast && data && (
        <div className="fixed bottom-5 right-5 z-30 rounded-md bg-zinc-900 px-4 py-2.5 text-[12px] text-white shadow-lg">
          데이터 연동 완료 · {data.meta.nodeCount}개 노드 노출
        </div>
      )}
    </>
  );
}
