/**
 * 현재 집계(필터·기간 반영)를 .xlsx 로 내보내기 (설계 §3-2 [엑셀내보내기]).
 *
 * 컬럼 = 화면과 동일(AGG_COLUMNS). 계층은 들여쓰기 라벨로 표현.
 * SheetJS(이미 의존성) 클라이언트 사이드 생성 → 서버 왕복 없음. 실수치는 로컬에서만.
 */

import * as XLSX from "xlsx";

import { AGG_COLUMNS, flattenTree, type TreeNode } from "@/lib/engine";

/** 포맷별 표시문자열(엑셀 셀은 가독 표시값 — 화면 포맷과 동일). */
function cellValue(format: string, v: number | null): string | number {
  if (v == null) return "";
  switch (format) {
    case "eok":
      return Number((v / 1e8).toFixed(2)); // 억 환산(숫자)
    case "pct":
      return Number((v * 100).toFixed(2)); // % 값(숫자)
    case "days":
      return Number(v.toFixed(0));
    case "qty":
      return Math.round(v);
    default:
      return Number(v.toFixed(2));
  }
}

/**
 * 트리 → 워크시트 → 다운로드. 모든 노드(전 레벨) 포함(엑셀에서 펼침 무관 전수).
 * @param filename 확장자 없는 베이스명.
 */
export function exportTreeToXlsx(
  root: TreeNode,
  meta: { periodLabel: string; filterLabel: string },
  filename: string,
): void {
  const flat = flattenTree(root);

  // 헤더: 계층 + 컬럼 라벨(단위 병기).
  const unitOf = (fmt: string) =>
    fmt === "eok" ? "(억)" : fmt === "pct" ? "(%)" : fmt === "days" ? "(일)" : fmt === "qty" ? "(량)" : "";
  const header = ["계층", ...AGG_COLUMNS.map((c) => `${c.label}${unitOf(c.format)}`)];

  const rows: (string | number)[][] = [header];
  for (const { node, depth } of flat) {
    const indent = "  ".repeat(depth);
    const label = `${indent}${node.label}`;
    const cells = AGG_COLUMNS.map((c) =>
      cellValue(c.format, node.metrics[c.field] as number | null),
    );
    rows.push([label, ...cells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 계층 열 너비 + 데이터 열 너비.
  ws["!cols"] = [{ wch: 28 }, ...AGG_COLUMNS.map(() => ({ wch: 14 }))];

  const wb = XLSX.utils.book_new();
  const meta1 = [
    [`OPR 물류 핵심지표 — ${meta.periodLabel}`],
    [`필터: ${meta.filterLabel}`],
    [`생성: ${new Date().toLocaleString("ko-KR")}`],
  ];
  // 메타를 시트 상단에 끼우려면 별도 시트가 깔끔.
  const metaWs = XLSX.utils.aoa_to_sheet(meta1);
  XLSX.utils.book_append_sheet(wb, ws, "물류핵심지표");
  XLSX.utils.book_append_sheet(wb, metaWs, "정보");

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
