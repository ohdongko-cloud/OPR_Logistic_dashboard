/**
 * 칸반 시트에서 엔진 앵커(판매일수·월일수·계수) 자동추출.
 *
 * 근거: 02_파일분석/엔진_transform_spec.md §3-2 — J18=(N/$D$1)*$E$1*$F$1.
 *   - 당월 칸반(`물류전체칸반(당월)`): D1=판매일수·E1=월일수·F1=계수.   (실측 21·30·1.22)
 *   - 누적 칸반(`물류전체칸반(누적)`): E1=판매일수·F1=월일수·G1=계수.   (실측 172·181·1.02)
 *     ※ 누적은 한 칸 시프트(D1 에는 당월 잔존값이 남아있어 신뢰 불가).
 *
 * 추출 실패(시트 없음·셀 비정상)면 기본 앵커로 폴백하고 source 로 표기 →
 * 업로드 폼에서 사용자가 확인·수정할 수 있게 한다.
 *
 * 보안: parse-workbook 과 동일한 매크로/외부링크 방어. 값만 읽고 수식 무시.
 */

import * as XLSX from "xlsx";

import {
  DEFAULT_ANCHORS,
  type PeriodAnchors,
  type PeriodType,
} from "@/lib/engine";

export interface AnchorExtraction {
  anchors: PeriodAnchors;
  /** "file" = 칸반 셀에서 추출 성공 · "default" = 기본값 폴백 */
  source: "file" | "default";
  /** 추출에 사용한 칸반 시트명(있으면) */
  sheetName?: string;
  /** 폴백 사유(default 일 때) */
  reason?: string;
}

/** period → (판매일수·월일수·계수) 셀 위치(칸반 1행). */
const ANCHOR_CELLS: Record<PeriodType, { salesDays: string; monthDays: string; factor: string }> = {
  MONTH: { salesDays: "D1", monthDays: "E1", factor: "F1" },
  CUMULATIVE: { salesDays: "E1", monthDays: "F1", factor: "G1" },
};

function cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref];
  if (!c) return null;
  if (c.t === "n" && typeof c.v === "number" && Number.isFinite(c.v)) return c.v;
  if (typeof c.v === "number" && Number.isFinite(c.v)) return c.v;
  if (typeof c.v === "string") {
    const n = Number(c.v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 칸반 워크시트(여러 후보명 대응)를 찾는다. */
function findKanbanSheet(wb: XLSX.WorkBook): { name: string; ws: XLSX.WorkSheet } | null {
  const name = wb.SheetNames.find((n) => n.normalize("NFKC").includes("물류전체칸반"));
  if (!name) return null;
  const ws = wb.Sheets[name];
  return ws ? { name, ws } : null;
}

/**
 * 업로드 바이트에서 앵커 추출. 실패 시 기본값.
 * @param bytes  아이템 워크북 .xlsx 바이트
 * @param period MONTH | CUMULATIVE
 */
export function extractAnchors(bytes: Uint8Array, period: PeriodType): AnchorExtraction {
  const fallback = (reason: string): AnchorExtraction => ({
    anchors: DEFAULT_ANCHORS[period],
    source: "default",
    reason,
  });

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: "array",
      dense: false,
      cellDates: false,
      cellFormula: false, // 값만(수식 무시)
      cellText: false,
    });
  } catch {
    return fallback("워크북 파싱 실패");
  }

  // 보안: 매크로/외부링크 방어(parse-workbook 동일).
  const wbProps = wb.Workbook?.WBProps as { codeName?: string } | undefined;
  if (wbProps?.codeName) return fallback("매크로 워크북");
  const extLinks = (wb.Workbook as unknown as { ExtLinks?: unknown[] })?.ExtLinks;
  if (Array.isArray(extLinks) && extLinks.length > 0) return fallback("외부 링크 워크북");

  const kb = findKanbanSheet(wb);
  if (!kb) return fallback("칸반 시트 없음");

  const cells = ANCHOR_CELLS[period];
  const salesDays = cellNum(kb.ws, cells.salesDays);
  const monthDays = cellNum(kb.ws, cells.monthDays);
  const factor = cellNum(kb.ws, cells.factor);

  // 유효성: 분모가 되는 판매일수·월일수는 > 0, 계수는 > 0.
  const valid =
    salesDays !== null &&
    salesDays > 0 &&
    monthDays !== null &&
    monthDays > 0 &&
    factor !== null &&
    factor > 0;

  if (!valid) return fallback(`칸반 앵커 셀(${cells.salesDays}/${cells.monthDays}/${cells.factor}) 비정상`);

  return {
    anchors: { salesDays: salesDays!, monthDays: monthDays!, factor: factor! },
    source: "file",
    sheetName: kb.name,
  };
}
