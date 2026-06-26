/**
 * 매장 집계(채널 필터 반영) → .xlsx 내보내기.
 *
 * 컬럼 = 화면과 동일(STORE_FLAT_COLS). 계층(전체→채널→점포)은 들여쓰기 라벨로.
 * SheetJS 클라이언트 생성 — 서버 왕복 없음(실수치 로컬에서만).
 */

import * as XLSX from "xlsx";

import { STORE_FLAT_COLS, type StoreTreeNodeDto } from "@/lib/engine-store";

function cellValue(format: string, v: number | null): string | number {
  if (v == null) return "";
  switch (format) {
    case "eok":
      return Number((v / 1e8).toFixed(2));
    case "pct":
      return Number((v * 100).toFixed(2));
    case "days":
      return Number(v.toFixed(0));
    case "qty":
      return Math.round(v);
    case "mult":
      return Number(v.toFixed(2));
    default:
      return Number(v.toFixed(2));
  }
}

export function exportStoreTreeToXlsx(
  flat: Array<{ node: StoreTreeNodeDto; depth: number }>,
  meta: { periodLabel: string; filterLabel: string },
  filename: string,
): void {
  const unitOf = (fmt: string) =>
    fmt === "eok" ? "(억)" : fmt === "pct" ? "(%)" : fmt === "days" ? "(일)" : fmt === "mult" ? "(배)" : "(량)";
  const header = ["계층(전체·채널·점포)", "점포코드", ...STORE_FLAT_COLS.map((c) => `${c.label}${unitOf(c.format)}`)];

  const rows: (string | number)[][] = [header];
  for (const { node, depth } of flat) {
    const indent = "  ".repeat(depth);
    const cells = STORE_FLAT_COLS.map((c) => cellValue(c.format, node.metrics[c.field] as number | null));
    rows.push([`${indent}${node.label}`, node.storeCode ?? "", ...cells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 10 }, ...STORE_FLAT_COLS.map(() => ({ wch: 13 }))];

  const wb = XLSX.utils.book_new();
  const metaWs = XLSX.utils.aoa_to_sheet([
    [`OPR 매장 SCM — ${meta.periodLabel}`],
    [`채널: ${meta.filterLabel}`],
    [`생성: ${new Date().toLocaleString("ko-KR")}`],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "매장SCM");
  XLSX.utils.book_append_sheet(wb, metaWs, "정보");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
