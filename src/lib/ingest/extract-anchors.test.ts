/**
 * 앵커 자동추출 단위 검증 — 칸반 시트 D1/E1/F1(당월) · E1/F1/G1(누적).
 *
 * 근거: 02_파일분석/엔진_transform_spec.md §3-2 J18=(N/$D$1)*$E$1*$F$1 ·
 *       engine-cumulative.test.ts(누적은 E1/F1/G1 로 시프트).
 *   - 당월 실측: D1=21·E1=30·F1=1.22 (G1 공란)
 *   - 누적 실측: E1=172·F1=181·G1=1.02
 *
 * 합성 워크북(메모리)으로 추출 로직을 핀고정 — 실파일 부재에도 항상 검증.
 */

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { MONTH_ANCHORS } from "@/lib/engine";

import { extractAnchors } from "./extract-anchors";

/** 칸반 시트 1개를 가진 합성 워크북 바이트 생성(앵커 셀만 채움). */
function makeKanbanWorkbook(
  sheetName: string,
  cells: Record<string, number>,
): Uint8Array {
  const ws: XLSX.WorkSheet = {};
  for (const [ref, v] of Object.entries(cells)) {
    ws[ref] = { t: "n", v };
  }
  // !ref 는 채운 셀을 모두 덮도록.
  const refs = Object.keys(cells);
  ws["!ref"] = refs.length ? `A1:${refs.sort().at(-1)}` : "A1:A1";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}

describe("extractAnchors — 칸반 앵커 자동추출", () => {
  it("당월 칸반(당월) D1/E1/F1 을 읽는다", () => {
    const bytes = makeKanbanWorkbook("물류전체칸반(당월)", {
      C1: 6,
      D1: 21,
      E1: 30,
      F1: 1.22,
    });
    const res = extractAnchors(bytes, "MONTH");
    expect(res.source).toBe("file");
    expect(res.anchors).toEqual({ salesDays: 21, monthDays: 30, factor: 1.22 });
  });

  it("누적 칸반(누적) E1/F1/G1 을 읽는다(시프트)", () => {
    const bytes = makeKanbanWorkbook("물류전체칸반(누적)", {
      D1: 21,
      E1: 172,
      F1: 181,
      G1: 1.02,
    });
    const res = extractAnchors(bytes, "CUMULATIVE");
    expect(res.source).toBe("file");
    expect(res.anchors).toEqual({ salesDays: 172, monthDays: 181, factor: 1.02 });
  });

  it("칸반 시트가 없으면 기본 앵커로 폴백(source=default)", () => {
    const bytes = makeKanbanWorkbook("매출상세분석", { A1: 1 });
    const res = extractAnchors(bytes, "MONTH");
    expect(res.source).toBe("default");
    expect(res.anchors).toEqual(MONTH_ANCHORS);
  });

  it("앵커 셀이 비정상(0/음수/비숫자)이면 기본 앵커로 폴백", () => {
    const bytes = makeKanbanWorkbook("물류전체칸반(당월)", {
      D1: 0, // 0 = 분모 불가 → 무효
      E1: 30,
      F1: 1.22,
    });
    const res = extractAnchors(bytes, "MONTH");
    expect(res.source).toBe("default");
    expect(res.anchors).toEqual(MONTH_ANCHORS);
  });
});
