"use client";

import { useMemo, useState } from "react";

import { isCritical, type AggColumn, type TreeNode } from "@/lib/engine";
import { fmtDays, fmtEok, fmtNum, fmtPct, fmtQty } from "@/lib/format";

/**
 * 드릴다운 트리테이블 — 조밀한 Excel風 (레퍼런스 BI 양식).
 *
 * - 스티키 헤더 + 스티키 첫 열(구분). 가로 스크롤(넓은 지표열).
 * - 그룹 트리행: 부모(전체→성별→신상이월→시즌→아이템) 굵게 + chevron, 클릭 펼침.
 *   자식행 = 들여쓰기 + 약한 배경. 아이템 리프 클릭 → SKU 모달.
 * - 정렬 화살표(↕): 클릭 시 형제행을 해당 컬럼 기준 정렬(트리 구조 보존).
 * - 색상 코딩: 핵심수치=파랑, 위험(임계 초과)=빨강, 양호=초록(0%/낮은 비율 등).
 * - 조밀 행높이 · 0.5px 행 구분선 · 우측정렬 숫자 + 천단위 콤마 · % 1자리 · tabular-nums.
 *
 * 엔진 로직/계약 불변 — node.metrics(FactRow) 표현만 담당.
 */

/** 그룹 헤더(상단 묶음) + 그 하위 컬럼. 레퍼런스 양식의 넓은 표. */
interface ColGroup {
  title: string;
  cols: AggColumn[];
}

/** 레퍼런스 컬럼 배치(엔진 전 지표, 좌→우 그룹). */
const COL_GROUPS: ColGroup[] = [
  {
    title: "실적",
    cols: [
      { field: "sales", label: "매출", excelCol: "E", format: "eok", defaultVisible: true },
      { field: "logiCost", label: "물류비", excelCol: "F", format: "eok", defaultVisible: true },
      { field: "logiRatio", label: "물류비율", excelCol: "G", format: "pct", defaultVisible: true, critical: "ratioHigh" },
    ],
  },
  {
    title: "재고일수",
    cols: [
      { field: "dotsTotal", label: "총", excelCol: "H", format: "days", defaultVisible: false, critical: "daysHigh" },
      { field: "dotsCtr", label: "센터", excelCol: "I", format: "days", defaultVisible: true, critical: "daysHigh" },
      { field: "dotsSto", label: "점포", excelCol: "J", format: "days", defaultVisible: false, critical: "daysHigh" },
    ],
  },
  {
    title: "물류비 내역",
    cols: [
      { field: "rent", label: "임차료", excelCol: "K", format: "eok", defaultVisible: false },
      { field: "labor", label: "인건비", excelCol: "L", format: "eok", defaultVisible: false },
      { field: "freight", label: "운반비", excelCol: "M", format: "eok", defaultVisible: false },
      { field: "pack", label: "포장비", excelCol: "N", format: "eok", defaultVisible: false },
    ],
  },
  {
    title: "센터재고",
    cols: [
      { field: "ctrQty", label: "재고량", excelCol: "O", format: "qty", defaultVisible: false },
      { field: "ctrAmt", label: "재고액", excelCol: "P", format: "eok", defaultVisible: false },
    ],
  },
  {
    title: "센터체화",
    cols: [
      { field: "ctrDeadAmt", label: "체화액", excelCol: "AJ", format: "eok", defaultVisible: false },
      { field: "deadCtrPct", label: "체화비중", excelCol: "AK", format: "pct", defaultVisible: true, critical: "ratioHigh" },
    ],
  },
  {
    title: "입출반",
    cols: [
      { field: "inQty", label: "입고", excelCol: "AF", format: "qty", defaultVisible: false },
      { field: "outQty", label: "출고", excelCol: "AG", format: "qty", defaultVisible: false },
      { field: "retQty", label: "반품", excelCol: "AH", format: "qty", defaultVisible: false },
    ],
  },
  {
    title: "점포재고",
    cols: [
      { field: "stoQty", label: "재고량", excelCol: "T", format: "qty", defaultVisible: false },
      { field: "stoAmt", label: "재고액", excelCol: "U", format: "eok", defaultVisible: false },
    ],
  },
  {
    title: "점포체화",
    cols: [
      { field: "stoDeadAmt", label: "체화액", excelCol: "AL", format: "eok", defaultVisible: false },
      { field: "deadStoPct", label: "체화비중", excelCol: "AM", format: "pct", defaultVisible: false, critical: "ratioHigh" },
    ],
  },
];

const FLAT_COLS: AggColumn[] = COL_GROUPS.flatMap((g) => g.cols);

type SortDir = "desc" | "asc";

export function TreeTable({
  root,
  query,
  onLeafClick,
}: {
  root: TreeNode;
  query?: string;
  onLeafClick: (node: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));
  const [sortField, setSortField] = useState<keyof TreeNode["metrics"] | null>(null);
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

  const onSort = (field: keyof TreeNode["metrics"]) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // 정렬 적용(형제 재정렬, 트리 구조 보존) + 검색 필터(라벨 매칭 + 조상 보존).
  const view = useMemo(() => {
    let t = root;
    if (sortField) t = sortTree(t, sortField, sortDir);
    if (query && query.length > 0) t = filterTree(t, query) ?? root;
    return t;
  }, [root, sortField, sortDir, query]);

  // 검색 시 매칭 경로 자동 펼침.
  const effectiveExpanded = useMemo(() => {
    if (!query) return expanded;
    return new Set(collectIds(view));
  }, [query, expanded, view]);

  const rows = useMemo(
    () => flattenVisible(view, effectiveExpanded),
    [view, effectiveExpanded],
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* 도구막대 */}
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
          <Legend swatch="bg-bad" text="위험" />
          <Legend swatch="bg-good" text="양호" />
          <span>· 아이템 클릭→SKU</span>
        </span>
      </div>

      {/* 테이블 */}
      <div className="max-h-[calc(100vh-330px)] overflow-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-20">
            {/* 그룹 헤더행 */}
            <tr className="bg-grid-head text-[10px] uppercase tracking-wide text-zinc-400">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-grid-head px-3 py-1.5 text-left align-bottom"
              >
                구분
              </th>
              {COL_GROUPS.map((g) => (
                <th
                  key={g.title}
                  colSpan={g.cols.length}
                  className="border-b border-l border-zinc-200 px-2 py-1 text-center font-semibold"
                >
                  {g.title}
                </th>
              ))}
            </tr>
            {/* 컬럼 헤더행(정렬) */}
            <tr className="bg-grid-head text-[11px] text-zinc-500">
              {COL_GROUPS.map((g) =>
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
                        <span className="text-[9px]">
                          {sorted ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={depth}
                expanded={effectiveExpanded.has(node.id)}
                onToggle={() => toggle(node.id)}
                onLeafClick={() => onLeafClick(node)}
              />
            ))}
            {rows.length <= 1 && query && (
              <tr>
                <td colSpan={FLAT_COLS.length + 1} className="px-3 py-6 text-center text-[12px] text-zinc-400">
                  &ldquo;{query}&rdquo; 와 일치하는 행이 없습니다.
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
  0: "bg-white",
  1: "bg-white",
  2: "bg-grid-row-alt",
  3: "bg-grid-row-alt",
  4: "bg-grid-row-alt",
};

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onLeafClick,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  onLeafClick: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isRoot = node.level === "L0_TOTAL";
  const isParent = !node.isLeaf;
  const rowBg = isRoot ? "bg-grid-head" : (DEPTH_BG[depth] ?? "bg-white");

  return (
    <tr className={["group border-b border-grid-line hover:bg-grid-hover", rowBg].join(" ")}>
      {/* 스티키 구분 열 */}
      <td
        className={[
          "sticky left-0 z-10 border-r border-zinc-200 px-2 py-[7px] text-left",
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
          {node.isLeaf ? (
            <button
              type="button"
              onClick={onLeafClick}
              className="text-zinc-700 underline-offset-2 hover:text-accent hover:underline"
              title="SKU 상세 보기"
            >
              {node.label}
            </button>
          ) : (
            <span className={isRoot || isParent ? "font-semibold text-zinc-800" : "text-zinc-700"}>
              {node.label}
            </span>
          )}
        </span>
      </td>

      {FLAT_COLS.map((c, i) => {
        const raw = node.metrics[c.field] as number | null;
        const tone = cellTone(c, raw);
        const groupStart = isGroupStart(i);
        return (
          <td
            key={c.field as string}
            className={[
              "tabnum whitespace-nowrap px-2 py-[7px] text-right",
              groupStart ? "border-l border-zinc-100" : "",
              isParent ? "font-medium" : "",
              tone,
            ].join(" ")}
          >
            {formatCell(c, raw)}
          </td>
        );
      })}
    </tr>
  );
}

/** 그룹 첫 컬럼이면 좌측 구분선. */
function isGroupStart(flatIndex: number): boolean {
  let acc = 0;
  for (const g of COL_GROUPS) {
    if (flatIndex === acc) return true;
    acc += g.cols.length;
  }
  return false;
}

/** 셀 색상 코딩 — 위험=빨강, 양호(체화비중 0·낮은 물류비율)=초록, 핵심(매출)=파랑, 기본=회색. */
function cellTone(col: AggColumn, v: number | null): string {
  if (v == null) return "text-zinc-400";
  if (isCritical(col, v)) return "text-bad font-medium";
  // 양호 신호: 체화비중/물류비율 계열이 0 또는 매우 낮을 때 초록.
  if (col.critical === "ratioHigh" && v <= 0.001) return "text-good";
  if (col.field === "sales") return "text-accent font-medium";
  return "text-zinc-700";
}

function formatCell(col: AggColumn, v: number | null): string {
  switch (col.format) {
    case "eok":
      return fmtEok(v);
    case "pct":
      return fmtPct(v);
    case "days":
      return fmtDays(v);
    case "qty":
      return fmtQty(v);
    default:
      return fmtNum(v);
  }
}

/** 펼침 상태 기준 깊이우선 평탄화. */
function flattenVisible(
  node: TreeNode,
  expanded: Set<string>,
  depth = 0,
): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [{ node, depth }];
  if (expanded.has(node.id)) {
    for (const c of node.children) out.push(...flattenVisible(c, expanded, depth + 1));
  }
  return out;
}

function collectIds(node: TreeNode): string[] {
  const out = [node.id];
  for (const c of node.children) out.push(...collectIds(c));
  return out;
}

/** 형제 재정렬(불변 복제) — 트리 구조·집계값 보존, 표시 순서만 변경. */
function sortTree(
  node: TreeNode,
  field: keyof TreeNode["metrics"],
  dir: SortDir,
): TreeNode {
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

/** 라벨 검색 — 매칭 노드 + 그 조상 경로 유지(부모 컨텍스트 보존). */
function filterTree(node: TreeNode, q: string): TreeNode | null {
  const lower = q.toLowerCase();
  const selfMatch = node.label.toLowerCase().includes(lower);
  const keptChildren = node.children
    .map((c) => filterTree(c, q))
    .filter((c): c is TreeNode => c !== null);
  if (selfMatch || keptChildren.length > 0) {
    return { ...node, children: selfMatch ? node.children : keptChildren };
  }
  return null;
}
