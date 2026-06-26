/**
 * 상품 집계(브랜드 필터 반영) → .xlsx 내보내기.
 *
 * 컬럼 = 화면과 동일(PRODUCT_FLAT_COLS, 3블록 + 비고). 계층(전체→브랜드→시즌)은 들여쓰기 라벨.
 * 자동불가(na) = "—(원천 필요)", 수기(manual) = "(수기)" placeholder — 가짜값 금지.
 * SheetJS 클라이언트 생성 — 서버 왕복 없음(실수치 로컬에서만).
 */

import * as XLSX from "xlsx";

import {
  brandDisplayName,
  PRODUCT_FLAT_COLS,
  type ProductCol,
  type ProductTreeNodeDto,
} from "@/lib/engine-product";

/** auto 셀 표시값(format). na/manual 은 placeholder. */
function cellValue(col: ProductCol, node: ProductTreeNodeDto): string | number {
  if (col.kind === "na") return "—(원천 필요)";
  if (col.kind === "manual") return "(수기)";
  const v = node.metrics[col.field] as number | null;
  if (v == null) return "";
  switch (col.format) {
    case "eok":
      return Number((v / 1e8).toFixed(2));
    case "pct":
      return Number((v * 100).toFixed(2));
    case "qty":
      return Math.round(v);
    case "mult":
      return Number(v.toFixed(2));
    default:
      return Number(v.toFixed(2));
  }
}

function unitOf(col: ProductCol): string {
  if (col.kind !== "auto") return "";
  switch (col.format) {
    case "eok":
      return "(억)";
    case "pct":
      return "(%)";
    case "mult":
      return "(배)";
    default:
      return "(량)";
  }
}

export function exportProductTreeToXlsx(
  flat: Array<{ node: ProductTreeNodeDto; depth: number }>,
  meta: { periodLabel: string; filterLabel: string },
  filename: string,
): void {
  const header = [
    "계층(전체·브랜드·시즌)",
    "브랜드코드",
    ...PRODUCT_FLAT_COLS.map((c) => `${c.label}${unitOf(c)}`),
  ];

  const rows: (string | number)[][] = [header];
  for (const { node, depth } of flat) {
    const indent = "  ".repeat(depth);
    // 브랜드 노드는 코드 표시명(매핑 미정 — 코드 그대로).
    const label =
      node.level === "L1_BRAND" && node.brandCode
        ? brandDisplayName(node.brandCode)
        : node.label;
    const cells = PRODUCT_FLAT_COLS.map((c) => cellValue(c, node));
    rows.push([`${indent}${label}`, node.brandCode ?? "", ...cells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 12 }, ...PRODUCT_FLAT_COLS.map(() => ({ wch: 13 }))];

  const wb = XLSX.utils.book_new();
  const metaWs = XLSX.utils.aoa_to_sheet([
    [`OPR 상품 SCM — ${meta.periodLabel}`],
    [`브랜드: ${meta.filterLabel}`],
    [`생성: ${new Date().toLocaleString("ko-KR")}`],
    ["주의: 자동불가(일자·리드타임) 8필드 = 원천(SAP 일자) 부재 → '—'. 수기 3필드(정보정확도·P별적합도·비고) = 추후 입력."],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "상품SCM");
  XLSX.utils.book_append_sheet(wb, metaWs, "정보");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
