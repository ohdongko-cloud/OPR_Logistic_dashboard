"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  flattenProductAggTree,
  PRODUCT_COL_GROUPS,
  type ProductTreeNodeDto,
} from "@/lib/engine-product";
import { exportProductTreeToXlsx } from "@/lib/export-product-xlsx";
import { Topbar } from "@/components/shell/topbar";

import { ProductKpiStrip } from "./product-kpi-strip";
import { ProductTreeTable } from "./product-tree-table";

/** /api/product-agg 응답. */
interface ProductAggResponse {
  ok: true;
  view: "product";
  period: "MONTH" | "CUMULATIVE";
  periodLabel: string;
  filter: { brandCode?: string };
  tree: ProductTreeNodeDto;
  meta: {
    brandCount: number;
    factCount: number;
    nodeCount: number;
    fieldCounts: { auto: number; na: number; manual: number };
    builtAtMs: number;
    source: "db" | "livefile";
  };
}

/**
 * ③ 상품 SCM — 브랜드(구매그룹 코드)×시즌 입고→상품화→판매 추적(레퍼런스 BI 양식).
 *
 * 레이아웃: Topbar(?period 토글 — 슬3·4 기준은 누적, 당월도 동일 파이프) → 안내배너(자동/수기 비율)
 *   → KPI 스트립 → 검색/엑셀 → 3단 트리테이블(전체→브랜드→시즌).
 * 자동 8필드=값. 자동불가 8(일자)=—. 수기 3(annotation)=✎ 슬롯. /api/product-agg 계약 불변.
 *
 * ★기간 라벨 단일진실원: 출고량·출고율·판매량·매총율 라벨/subtitle 접두("누적"/"당월")는
 *   서버 응답 periodLabel(=데이터 기간)에 종속한다. 당월 스냅샷이면 라벨도 "당월…"으로 표기되어
 *   "누적"이라 적힌 칸에 당월 값이 들어가는 라벨/데이터 불일치를 제거한다.
 */
export function ProductView() {
  const params = useSearchParams();
  // 기간 토글(Topbar 와 동일 ?period 계약). 슬3·4=누적뷰가 기준이나 당월도 동일 파이프.
  const period = params.get("period") === "cumulative" ? "누적" : "당월";

  const [query, setQuery] = useState("");
  const [data, setData] = useState<ProductAggResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ period_type: period });
      try {
        const r = await fetch(`/api/product-agg?${qs.toString()}`, { signal: ac.signal });
        const j: ProductAggResponse | { ok: false; detail?: string } = await r.json();
        if (j.ok) setData(j);
        else setError(("detail" in j && j.detail) || "상품 집계 조회 실패");
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError("네트워크 오류");
      } finally {
        setLoading(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [period]);

  const filterText = useMemo(() => "전체 브랜드", []);

  const onExport = useCallback(() => {
    if (!data) return;
    const flat = flattenProductAggTree(data.tree);
    exportProductTreeToXlsx(
      flat,
      { periodLabel: data.periodLabel, filterLabel: filterText },
      `OPR_상품SCM_${data.periodLabel}_${new Date().toISOString().slice(0, 10)}`,
    );
  }, [data, filterText]);

  return (
    <>
      <Topbar
        title="상품 SCM — 브랜드·시즌"
        subtitle={`전체 → 브랜드(구매그룹) → 시즌 드릴다운 · 입고→상품화→판매 ${period}추적`}
      />

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {/* 자동/수기 비율 정직 고지(스펙 §2-E — 19필드 中 8 자동). */}
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[12px] text-sky-800">
          <b>자동집계 8필드</b>(입고·재고·출고·출고율·판매·출고비판매·입고비판매·매총율)는 실데이터로 채워집니다.{" "}
          <b className="text-zinc-500">자동불가 8필드</b>(입고일·리드타임·일자류)는{" "}
          <span className="font-mono">—</span> = <b>원천(SAP 일자) 필요(추후)</b>,{" "}
          <b className="text-amber-600">수기 3필드</b>(정보정확도·P별적합도·비고)는{" "}
          <span className="font-mono">✎</span> = 입력면(추후). 가짜값은 넣지 않습니다.
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            데이터를 불러올 수 없습니다: {error}
            <p className="mt-1 text-xs text-red-500">
              서버가 상품 원본(아이템 워크북)을 읽지 못했을 수 있습니다. 경로·파일을 확인하세요.
            </p>
          </div>
        )}

        {data && (
          <ProductKpiStrip
            metrics={data.tree.metrics}
            periodLabel={data.periodLabel}
            filterLabel={filterText}
          />
        )}

        {/* 검색 + 엑셀 */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]">
          <span className="text-[11px] font-medium text-zinc-400">브랜드 검색</span>
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="구매그룹 코드"
              className="w-56 rounded-md border border-zinc-300 bg-white py-1 pl-7 pr-2 text-[12px] text-zinc-700 placeholder:text-zinc-400 focus:border-accent focus:outline-none"
            />
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">⌕</span>
          </div>
          <span className="text-[10px] text-zinc-400">※ 브랜드명 매핑 미정 — 구매그룹 코드 표시</span>
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
            브랜드 {data.meta.brandCount} · 행 {data.meta.factCount} · 노드 {data.meta.nodeCount} ·
            자동 {data.meta.fieldCounts.auto}/수기 {data.meta.fieldCounts.manual}/원천대기{" "}
            {data.meta.fieldCounts.na} 필드 · 집계 {data.meta.builtAtMs}ms · {data.periodLabel} · 출처{" "}
            {data.meta.source === "db" ? "DB" : "라이브파일"}
          </p>
        )}

        {loading && !data && (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
            상품 집계 불러오는 중…
          </div>
        )}

        {data && <ProductTreeTable root={data.tree} query={query} periodLabel={data.periodLabel} />}

        {/* 컬럼 범례(블록·책임). */}
        {data && (
          <p className="text-[10px] text-zinc-300">
            블록:{" "}
            {PRODUCT_COL_GROUPS.map((g) => `${g.title}(${g.responsibility})`).join(" · ")}
          </p>
        )}
      </div>
    </>
  );
}
