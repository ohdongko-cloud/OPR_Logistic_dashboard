"use client";

import { useMemo, useState } from "react";

import {
  AGG_COLUMNS,
  isCritical,
  type AggColumn,
  type TreeNode,
} from "@/lib/engine";
import { fmtDays, fmtEok, fmtNum, fmtPct, fmtQty } from "@/lib/format";

/**
 * 드릴다운 트리테이블 (설계 §3-2 — 메인 위젯, 접었다 폈다).
 *
 * - 5단계 계층(전체→성별→신상이월→시즌→아이템) 들여쓰기 + ▶/▼ 토글.
 * - 기본 접힘(루트만 펼침). 클릭 확장. 전체펼침/전체접힘.
 * - 열 선택(기본 6 KPI열 + 확장 19열). 임계 강조(⚠ 빨강).
 * - 아이템 리프 클릭 → onLeafClick(SKU 모달).
 */
export function TreeTable({
  root,
  onLeafClick,
}: {
  root: TreeNode;
  onLeafClick: (node: TreeNode) => void;
}) {
  // 펼침 상태: 노드 id 집합. 기본 = 루트만 펼침.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));
  const [visibleFields, setVisibleFields] = useState<Set<string>>(
    () => new Set(AGG_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.field as string)),
  );
  const [showColPicker, setShowColPicker] = useState(false);

  const cols = useMemo(
    () => AGG_COLUMNS.filter((c) => visibleFields.has(c.field as string)),
    [visibleFields],
  );

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

  const toggleField = (field: string) =>
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const rows = useMemo(() => flattenVisible(root, expanded), [root, expanded]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* 도구막대 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs">
        <button type="button" onClick={expandAll} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          전체펼침
        </button>
        <button type="button" onClick={collapseAll} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          전체접힘
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColPicker((v) => !v)}
            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50"
          >
            열 선택 ▾ ({cols.length})
          </button>
          {showColPicker && (
            <div className="absolute z-20 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
              {AGG_COLUMNS.map((c) => (
                <label key={c.field as string} className="flex items-center gap-2 px-1 py-1 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={visibleFields.has(c.field as string)}
                    onChange={() => toggleField(c.field as string)}
                  />
                  <span className="text-zinc-700">{c.label}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{c.excelCol}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="ml-auto text-[11px] text-zinc-400">
          ▼펼침 ▶접힘 · 아이템 클릭→SKU 상세 · ⚠임계
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left font-medium">계층 (드릴다운)</th>
              {cols.map((c) => (
                <th key={c.field as string} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={depth}
                cols={cols}
                expanded={expanded.has(node.id)}
                onToggle={() => toggle(node.id)}
                onLeafClick={() => onLeafClick(node)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  cols,
  expanded,
  onToggle,
  onLeafClick,
}: {
  node: TreeNode;
  depth: number;
  cols: AggColumn[];
  expanded: boolean;
  onToggle: () => void;
  onLeafClick: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isRoot = node.level === "L0_TOTAL";

  return (
    <tr className={["border-b border-zinc-100 hover:bg-zinc-50", isRoot ? "font-semibold" : ""].join(" ")}>
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left">
        <span style={{ paddingLeft: depth * 16 }} className="inline-flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? "접기" : "펼치기"}
              className="w-4 text-zinc-400 hover:text-zinc-700"
            >
              {expanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4 text-center text-zinc-300">·</span>
          )}
          {node.isLeaf ? (
            <button
              type="button"
              onClick={onLeafClick}
              className="text-zinc-800 underline-offset-2 hover:text-blue-600 hover:underline"
              title="SKU 상세 보기"
            >
              {node.label}
            </button>
          ) : (
            <span className="text-zinc-800">{node.label}</span>
          )}
        </span>
      </td>
      {cols.map((c) => {
        const raw = node.metrics[c.field] as number | null;
        const warn = isCritical(c, raw);
        return (
          <td
            key={c.field as string}
            className={[
              "px-3 py-1.5 text-right tabular-nums whitespace-nowrap",
              warn ? "font-medium text-red-600" : "text-zinc-700",
            ].join(" ")}
          >
            {warn && "⚠ "}
            {formatCell(c, raw)}
          </td>
        );
      })}
    </tr>
  );
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

/** 펼침 상태 기준으로 보이는 행만 깊이우선 평탄화. */
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
