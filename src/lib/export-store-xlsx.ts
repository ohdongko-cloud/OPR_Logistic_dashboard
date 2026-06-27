/**
 * 매장 집계(채널 필터 반영) → .xlsx 내보내기.
 *
 * 컬럼 = 화면과 동일(STORE_FLAT_COLS). 계층(전체→채널→점포)은 들여쓰기 라벨로.
 * SheetJS 클라이언트 생성 — 서버 왕복 없음(실수치 로컬에서만).
 */

import * as XLSX from "xlsx";

import {
  buildStoreFlatCols,
  storeRatioDenom,
  storeRatioMin,
  type StoreAggColumn,
  type StoreNodeMetrics,
  type StoreTreeNodeDto,
} from "@/lib/engine-store";
import { guardedExportCell } from "@/lib/export-guard";

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

/**
 * C14: 컬럼 1셀 — 비율 컬럼(가드 매핑 존재)이면 화면과 동일 희소-분모 보류("—"),
 * 비-비율(가드 미매핑) 원시값은 그대로. 분모·임계는 화면(store-tree-table)과 동일 소스.
 */
export function storeCellValue(c: StoreAggColumn, metrics: StoreNodeMetrics): string | number {
  const raw = metrics[c.field] as number | null;
  const min = storeRatioMin(c.field);
  const denom = storeRatioDenom(c.field, metrics);
  return guardedExportCell(raw, denom, min, (v) => cellValue(c.format, v));
}

export function exportStoreTreeToXlsx(
  flat: Array<{ node: StoreTreeNodeDto; depth: number }>,
  meta: { periodLabel: string; filterLabel: string; seasonLabel?: string },
  filename: string,
): void {
  // 시즌 반영 컬럼(C12) — "{시즌}재고량" 라벨 동적. seasonLabel 미지정 시 default("여름")=현행.
  const cols = buildStoreFlatCols(meta.seasonLabel);
  const unitOf = (fmt: string) =>
    fmt === "eok" ? "(억)" : fmt === "pct" ? "(%)" : fmt === "days" ? "(일)" : fmt === "mult" ? "(배)" : "(량)";
  const header = ["계층(전체·채널·점포)", "점포코드", ...cols.map((c) => `${c.label}${unitOf(c.format)}`)];

  const rows: (string | number)[][] = [header];
  for (const { node, depth } of flat) {
    const indent = "  ".repeat(depth);
    // C14: 희소 분모 비율은 화면과 동일하게 공란("—"). 비-비율 원시값은 그대로.
    const cells = cols.map((c) => storeCellValue(c, node.metrics));
    rows.push([`${indent}${node.label}`, node.storeCode ?? "", ...cells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 10 }, ...cols.map(() => ({ wch: 13 }))];

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
