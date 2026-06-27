"use client";

import { useMemo, useState } from "react";

import {
  brandDisplayName,
  productColLabel,
  productRatioDenom,
  productRatioMin,
  PRODUCT_COL_GROUPS,
  PRODUCT_FLAT_COLS,
  type ProductCol,
  type ProductNodeMetrics,
  type ProductTreeNodeDto,
} from "@/lib/engine-product";
import { fmtEok, fmtMult, fmtNum, fmtPct, fmtQty } from "@/lib/format";
import { guardedText } from "@/components/shared/guarded-ratio";
import { aggRowBg } from "@/components/shared/row-tone";
import {
  useTableDensity,
  type DensityTokens,
} from "@/components/shared/use-table-density";
import { DensityToggle } from "@/components/shared/density-toggle";

/**
 * 상품 드릴다운 트리테이블 — 전체→브랜드→시즌 3단(레퍼런스 BI 양식, 매장 tree-table 재사용).
 *
 * 3블록(입고→상품화→판매) + 비고. 컬럼 종류:
 *   - auto(자동 8): 엔진 지표 값 채움.
 *   - na(자동불가 8): "—" + 회색 + 툴팁("원천 필요(추후)").
 *   - manual(수기 3): 입력 슬롯 표시(annotation — 별도 입력면). 여기선 "✎ 입력" placeholder.
 *
 * ★자동불가/수기는 가짜값 금지 — 명시적 placeholder.
 */

type SortDir = "desc" | "asc";
type AutoField = keyof ProductNodeMetrics;

export function ProductTreeTable({
  root,
  query,
  periodLabel,
}: {
  root: ProductTreeNodeDto;
  query?: string;
  /** "누적"/"당월" — periodPrefix 컬럼 헤더의 동적 접두(데이터=라벨 일치). */
  periodLabel: string;
}) {
  const { density, tokens, toggle: toggleDensity } = useTableDensity();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));
  const [sortField, setSortField] = useState<AutoField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const allIds = useMemo(() => collectIds(root), [root]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set([root.id]));

  const onSort = (field: AutoField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const view = useMemo(() => {
    let t = root;
    if (sortField) t = sortTree(t, sortField, sortDir);
    if (query && query.length > 0) t = filterTree(t, query) ?? root;
    return t;
  }, [root, sortField, sortDir, query]);

  const effectiveExpanded = useMemo(() => {
    if (!query) return expanded;
    return new Set(collectIds(view));
  }, [query, expanded, view]);

  const rows = useMemo(() => flattenVisible(view, effectiveExpanded), [view, effectiveExpanded]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2 text-[12px]">
        <button type="button" onClick={expandAll} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          전체펼침
        </button>
        <button type="button" onClick={collapseAll} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          전체접힘
        </button>
        <DensityToggle density={density} onToggle={toggleDensity} />
        {sortField && (
          <button
            type="button"
            onClick={() => setSortField(null)}
            className="rounded border border-zinc-300 px-2 py-1 text-zinc-500 hover:bg-zinc-50"
          >
            정렬 해제
          </button>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-400">
          <Legend swatch="bg-accent" text="자동집계" />
          <Legend swatch="bg-zinc-300" text="— 원천 필요(일자)" />
          <Legend swatch="bg-amber-400" text="✎ 수기(추후)" />
          <span>· 브랜드 클릭→시즌 펼침</span>
        </span>
      </div>

      {/* 페이지 스크롤(가로만 내부, 헤더 sticky). UI 피드백 ③ */}
      <div className="overflow-x-auto">
        <table className={["w-full min-w-[1280px] border-collapse", tokens.tableFont].join(" ")}>
          <thead className="z-20">
            <tr className="bg-grid-head text-[10px] uppercase tracking-wide text-zinc-400">
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 border-b border-r border-zinc-200 bg-grid-head px-3 py-1.5 text-left align-bottom"
              >
                전체 · 브랜드 · 시즌
              </th>
              {PRODUCT_COL_GROUPS.map((g) => (
                <th
                  key={g.title}
                  colSpan={g.cols.length}
                  className="sticky top-0 z-20 border-b border-l border-zinc-200 bg-grid-head px-2 py-1 text-center font-semibold"
                  title={g.responsibility}
                >
                  {g.title}
                  <span className="ml-1 text-[9px] font-normal text-zinc-400">· {g.responsibility}</span>
                </th>
              ))}
            </tr>
            <tr className="bg-grid-head text-[11px] text-zinc-500">
              {PRODUCT_COL_GROUPS.map((g) =>
                g.cols.map((c, ci) => (
                  <th
                    key={`${g.title}-${c.label}`}
                    className={[
                      "sticky top-[31px] z-20 whitespace-nowrap border-b border-zinc-200 bg-grid-head px-2 py-1 text-right font-medium",
                      ci === 0 ? "border-l border-zinc-200" : "",
                    ].join(" ")}
                  >
                    {c.kind === "auto" ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.field)}
                        className={[
                          "inline-flex items-center gap-0.5 hover:text-zinc-800",
                          sortField === c.field ? "text-accent" : "",
                        ].join(" ")}
                        title={`${productColLabel(c, periodLabel)} — 출처: ${c.source} · 정렬`}
                      >
                        {productColLabel(c, periodLabel)}
                        <span className="text-[9px]">
                          {sortField === c.field ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
                        </span>
                      </button>
                    ) : (
                      <span
                        className={c.kind === "na" ? "text-zinc-400" : "text-amber-500"}
                        title={
                          c.kind === "na"
                            ? `원천 필요(추후) — ${c.reason}`
                            : "수기 입력(추후) — annotation"
                        }
                      >
                        {c.label}
                        <span className="ml-0.5 text-[9px]">{c.kind === "na" ? "▪" : "✎"}</span>
                      </span>
                    )}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => (
              <ProductRow
                key={node.id}
                node={node}
                depth={depth}
                tokens={tokens}
                expanded={effectiveExpanded.has(node.id)}
                onToggle={() => toggle(node.id)}
              />
            ))}
            {rows.length <= 1 && query && (
              <tr>
                <td colSpan={PRODUCT_FLAT_COLS.length + 1} className="px-3 py-6 text-center text-[12px] text-zinc-400">
                  &ldquo;{query}&rdquo; 와 일치하는 브랜드가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-sm ${swatch}`} />
      {text}
    </span>
  );
}

function ProductRow({
  node,
  depth,
  tokens,
  expanded,
  onToggle,
}: {
  node: ProductTreeNodeDto;
  depth: number;
  tokens: DensityTokens;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isRoot = node.level === "L0_TOTAL";
  const isParent = !node.isLeaf;
  // 집계행(전체·브랜드) = 단계 톤, 시즌(리프) = 흰배경. UI 피드백 ②
  const rowBg = aggRowBg({ isLeaf: node.isLeaf, depth });
  // 브랜드 노드 = 코드 표시명(매핑 미정 → 코드 그대로).
  const displayLabel =
    node.level === "L1_BRAND" && node.brandCode ? brandDisplayName(node.brandCode) : node.label;

  return (
    <tr className={["group border-b border-grid-line hover:bg-grid-hover", rowBg].join(" ")}>
      <td
        className={[
          "sticky left-0 z-10 border-r border-zinc-200 text-left",
          tokens.cellPadX,
          tokens.cellPadY,
          rowBg,
          "group-hover:bg-grid-hover",
        ].join(" ")}
      >
        <span style={{ paddingLeft: depth * 14 }} className="inline-flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? "접기" : "펼치기"}
              className="grid h-4 w-4 place-items-center text-[9px] text-zinc-400 transition-transform hover:text-zinc-700"
              style={{ transform: expanded ? "rotate(90deg)" : "none" }}
            >
              ▶
            </button>
          ) : (
            <span className="inline-block w-4 text-center text-zinc-300">·</span>
          )}
          <span className={isRoot || isParent ? "font-semibold text-zinc-800" : "text-zinc-700"}>
            {displayLabel}
          </span>
        </span>
      </td>

      {PRODUCT_FLAT_COLS.map((c, i) => {
        const g = guardForCol(c, node.metrics);
        return (
          <td
            key={`${c.label}-${i}`}
            className={[
              "tabnum whitespace-nowrap text-right",
              tokens.cellPadX,
              tokens.cellPadY,
              isGroupStart(i) ? "border-l border-zinc-100" : "",
              isParent ? "font-medium" : "",
              g.suppressed ? "text-zinc-300" : cellTone(c, node.metrics),
            ].join(" ")}
            title={g.suppressed ? g.reason : undefined}
          >
            {g.text}
          </td>
        );
      })}
    </tr>
  );
}

function isGroupStart(flatIndex: number): boolean {
  let acc = 0;
  for (const g of PRODUCT_COL_GROUPS) {
    if (flatIndex === acc) return true;
    acc += g.cols.length;
  }
  return false;
}

function cellTone(col: ProductCol, m: ProductNodeMetrics): string {
  if (col.kind === "na") return "text-zinc-300";
  if (col.kind === "manual") return "text-amber-500";
  const v = m[col.field] as number | null;
  if (v == null) return "text-zinc-400";
  if (col.field === "saleVsIn" || col.field === "outRate") return "text-accent font-medium";
  return "text-zinc-700";
}

function formatCell(col: ProductCol, m: ProductNodeMetrics): string {
  if (col.kind === "na") return "—";
  if (col.kind === "manual") return "✎";
  const v = m[col.field] as number | null;
  switch (col.format) {
    case "eok":
      return fmtEok(v);
    case "pct":
      return fmtPct(v);
    case "qty":
      return fmtQty(v);
    case "mult":
      return fmtMult(v);
    default:
      return fmtNum(v);
  }
}

/** auto 비율 컬럼이면 희소 분모 가드 적용. na/manual·가산 컬럼은 그대로. */
function guardForCol(
  col: ProductCol,
  m: ProductNodeMetrics,
): { text: string; suppressed: boolean; reason?: string } {
  if (col.kind !== "auto") return { text: formatCell(col, m), suppressed: false };
  const min = productRatioMin(col.field);
  const denom = productRatioDenom(col.field, m);
  const raw = m[col.field] as number | null;
  return guardedText(raw, denom, min, (v) =>
    formatCell({ ...col, field: col.field }, { ...m, [col.field]: v }),
  );
}

function flattenVisible(
  node: ProductTreeNodeDto,
  expanded: Set<string>,
  depth = 0,
): Array<{ node: ProductTreeNodeDto; depth: number }> {
  const out: Array<{ node: ProductTreeNodeDto; depth: number }> = [{ node, depth }];
  if (expanded.has(node.id)) {
    for (const c of node.children) out.push(...flattenVisible(c, expanded, depth + 1));
  }
  return out;
}

function collectIds(node: ProductTreeNodeDto): string[] {
  const out = [node.id];
  for (const c of node.children) out.push(...collectIds(c));
  return out;
}

function sortTree(node: ProductTreeNodeDto, field: AutoField, dir: SortDir): ProductTreeNodeDto {
  if (node.children.length === 0) return node;
  const sorted = [...node.children]
    .map((c) => sortTree(c, field, dir))
    .sort((a, b) => {
      const av = (a.metrics[field] as number | null) ?? -Infinity;
      const bv = (b.metrics[field] as number | null) ?? -Infinity;
      return dir === "desc" ? bv - av : av - bv;
    });
  return { ...node, children: sorted };
}

function filterTree(node: ProductTreeNodeDto, q: string): ProductTreeNodeDto | null {
  const lower = q.toLowerCase();
  const hay = `${node.label} ${node.brandCode ?? ""} ${
    node.brandCode ? brandDisplayName(node.brandCode) : ""
  }`.toLowerCase();
  const selfMatch = hay.includes(lower);
  const keptChildren = node.children
    .map((c) => filterTree(c, q))
    .filter((c): c is ProductTreeNodeDto => c !== null);
  if (selfMatch || keptChildren.length > 0) {
    return { ...node, children: selfMatch ? node.children : keptChildren };
  }
  return null;
}
