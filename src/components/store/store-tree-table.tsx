"use client";

import { useMemo, useState } from "react";

import {
  buildStoreColGroups,
  DEFAULT_SEASON_LABEL,
  isStoreCritical,
  storeRatioDenom,
  storeRatioMin,
  type StoreAggColumn,
  type StoreColGroup,
  type StoreTreeNodeDto,
} from "@/lib/engine-store";
import { fmtDays, fmtEok, fmtMult, fmtNum, fmtPct, fmtQty } from "@/lib/format";
import { guardedText } from "@/components/shared/guarded-ratio";

/**
 * 매장 드릴다운 트리테이블 — 전체→채널→점포 3단(레퍼런스 BI 양식, 아이템 tree-table 재사용).
 *
 * - 스티키 헤더 + 스티키 첫 열(구분/점포). 그룹 헤더 + 정렬 화살표.
 * - 색상: (−)재고 음수=빨강, 재고일수 임계=빨강, 판매배수 핵심=파랑.
 * - 펼침: 채널 클릭 → 점포 카드 펼침. 접었다폈다.
 *
 * 엔진/계약 불변 — node.metrics(StoreNodeMetrics) 표현만.
 */

type SortDir = "desc" | "asc";

export function StoreTreeTable({
  root,
  query,
  seasonLabel = DEFAULT_SEASON_LABEL,
}: {
  root: StoreTreeNodeDto;
  query?: string;
  /** 스냅샷 시즌명(C12) — "{시즌}재고량" 라벨 동적화. */
  seasonLabel?: string;
}) {
  // 시즌 반영 컬럼 정의(default="여름"=현행). 산식·필드 불변, 라벨만 동적.
  const colGroups = useMemo(() => buildStoreColGroups(seasonLabel), [seasonLabel]);
  const flatCols = useMemo(() => colGroups.flatMap((g) => g.cols), [colGroups]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));
  const [sortField, setSortField] = useState<keyof StoreTreeNodeDto["metrics"] | null>(null);
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

  const onSort = (field: keyof StoreTreeNodeDto["metrics"]) => {
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
        {sortField && (
          <button
            type="button"
            onClick={() => setSortField(null)}
            className="rounded border border-zinc-300 px-2 py-1 text-zinc-500 hover:bg-zinc-50"
          >
            정렬 해제
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-400">
          <Legend swatch="bg-accent" text="핵심" />
          <Legend swatch="bg-bad" text="위험/(−)재고" />
          <span>· 채널 클릭→점포 펼침</span>
        </span>
      </div>

      <div className="max-h-[calc(100vh-330px)] overflow-auto">
        <table className="w-full min-w-[1000px] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-grid-head text-[10px] uppercase tracking-wide text-zinc-400">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-grid-head px-3 py-1.5 text-left align-bottom"
              >
                전체 · 채널 · 점포
              </th>
              {colGroups.map((g) => (
                <th
                  key={g.title}
                  colSpan={g.cols.length}
                  className="border-b border-l border-zinc-200 px-2 py-1 text-center font-semibold"
                >
                  {g.title}
                </th>
              ))}
            </tr>
            <tr className="bg-grid-head text-[11px] text-zinc-500">
              {colGroups.map((g) =>
                g.cols.map((c, ci) => {
                  const sorted = sortField === c.field;
                  return (
                    <th
                      key={c.field as string}
                      className={[
                        "whitespace-nowrap border-b border-zinc-200 px-2 py-1 text-right font-medium",
                        ci === 0 ? "border-l border-zinc-200" : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(c.field)}
                        className={[
                          "inline-flex items-center gap-0.5 hover:text-zinc-800",
                          sorted ? "text-accent" : "",
                        ].join(" ")}
                        title={`${g.title} · ${c.label} (엑셀 ${c.excelCol}) — 정렬`}
                      >
                        {c.label}
                        <span className="text-[9px]">{sorted ? (sortDir === "desc" ? "▼" : "▲") : "↕"}</span>
                      </button>
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => (
              <StoreRow
                key={node.id}
                node={node}
                depth={depth}
                expanded={effectiveExpanded.has(node.id)}
                onToggle={() => toggle(node.id)}
                colGroups={colGroups}
              />
            ))}
            {rows.length <= 1 && query && (
              <tr>
                <td colSpan={flatCols.length + 1} className="px-3 py-6 text-center text-[12px] text-zinc-400">
                  &ldquo;{query}&rdquo; 와 일치하는 점포가 없습니다.
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

const DEPTH_BG: Record<number, string> = {
  0: "bg-grid-head",
  1: "bg-white",
  2: "bg-grid-row-alt",
};

function StoreRow({
  node,
  depth,
  expanded,
  onToggle,
  colGroups,
}: {
  node: StoreTreeNodeDto;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  colGroups: StoreColGroup[];
}) {
  const flatCols = colGroups.flatMap((g) => g.cols);
  const hasChildren = node.children.length > 0;
  const isRoot = node.level === "L0_TOTAL";
  const isParent = !node.isLeaf;
  const rowBg = DEPTH_BG[depth] ?? "bg-white";

  return (
    <tr className={["group border-b border-grid-line hover:bg-grid-hover", rowBg].join(" ")}>
      <td
        className={["sticky left-0 z-10 border-r border-zinc-200 px-2 py-[7px] text-left", rowBg, "group-hover:bg-grid-hover"].join(" ")}
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
            {node.label}
            {node.isLeaf && node.storeCode && (
              <span className="ml-1.5 text-[10px] text-zinc-400">{node.storeCode}</span>
            )}
          </span>
        </span>
      </td>

      {flatCols.map((c, i) => {
        const raw = node.metrics[c.field] as number | null;
        // 희소 분모 가드(판매배수·재고일수·시즌비중·재고보유율).
        const min = storeRatioMin(c.field);
        const denom = storeRatioDenom(c.field, node.metrics);
        const g = guardedText(raw, denom, min, (v) => formatCell(c, v));
        const tone = g.suppressed ? "text-zinc-300" : cellTone(c, raw);
        const groupStart = isGroupStart(i, colGroups);
        return (
          <td
            key={c.field as string}
            className={[
              "tabnum whitespace-nowrap px-2 py-[7px] text-right",
              groupStart ? "border-l border-zinc-100" : "",
              isParent ? "font-medium" : "",
              tone,
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

function isGroupStart(flatIndex: number, colGroups: StoreColGroup[]): boolean {
  let acc = 0;
  for (const g of colGroups) {
    if (flatIndex === acc) return true;
    acc += g.cols.length;
  }
  return false;
}

function cellTone(col: StoreAggColumn, v: number | null): string {
  if (v == null) return "text-zinc-400";
  if (isStoreCritical(col, v)) return "text-bad font-medium";
  if (col.field === "saleMult") return "text-accent font-medium";
  if (col.field === "negQty" || col.field === "negAmt") return v < 0 ? "text-bad font-medium" : "text-good";
  return "text-zinc-700";
}

function formatCell(col: StoreAggColumn, v: number | null): string {
  switch (col.format) {
    case "eok":
      return fmtEok(v);
    case "pct":
      return fmtPct(v);
    case "days":
      return fmtDays(v);
    case "qty":
      return fmtQty(v);
    case "mult":
      return fmtMult(v);
    default:
      return fmtNum(v);
  }
}

function flattenVisible(
  node: StoreTreeNodeDto,
  expanded: Set<string>,
  depth = 0,
): Array<{ node: StoreTreeNodeDto; depth: number }> {
  const out: Array<{ node: StoreTreeNodeDto; depth: number }> = [{ node, depth }];
  if (expanded.has(node.id)) {
    for (const c of node.children) out.push(...flattenVisible(c, expanded, depth + 1));
  }
  return out;
}

function collectIds(node: StoreTreeNodeDto): string[] {
  const out = [node.id];
  for (const c of node.children) out.push(...collectIds(c));
  return out;
}

function sortTree(
  node: StoreTreeNodeDto,
  field: keyof StoreTreeNodeDto["metrics"],
  dir: SortDir,
): StoreTreeNodeDto {
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

function filterTree(node: StoreTreeNodeDto, q: string): StoreTreeNodeDto | null {
  const lower = q.toLowerCase();
  const selfMatch =
    node.label.toLowerCase().includes(lower) || (node.storeCode ?? "").toLowerCase().includes(lower);
  const keptChildren = node.children
    .map((c) => filterTree(c, q))
    .filter((c): c is StoreTreeNodeDto => c !== null);
  if (selfMatch || keptChildren.length > 0) {
    return { ...node, children: selfMatch ? node.children : keptChildren };
  }
  return null;
}
