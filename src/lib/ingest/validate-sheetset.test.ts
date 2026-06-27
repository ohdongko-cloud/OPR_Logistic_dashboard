/**
 * validateSheetSet — 시트세트 완전성 + 중복 차단(리뷰 #6).
 *
 * 핵심: 필수 RAW 시트가 모두 있어도 같은 타입이 2개면 ok=false(이중계산 방지).
 *   (이전엔 duplicates 가 계산만 되고 ok 에 미반영 → dead code 였음.)
 */

import { describe, expect, it } from "vitest";

import type { ParsedWorkbook } from "./parse-workbook";
import { REQUIRED_RAW_SHEETS, type SheetType } from "./sheet-types";
import { validateSheetSet } from "./validate-sheetset";

/** 감지 타입만 의미 있는 최소 워크북(데이터 무관). */
function wbWithTypes(types: (SheetType | null)[]): ParsedWorkbook {
  return {
    ignored: [],
    sheets: types.map((t, i) => ({
      name: `sheet${i}`,
      detection: { type: t, confidence: t ? 1 : 0, scores: {}, reason: "test" },
      headerRows: [],
      dataRows: [],
      dataStartRow: 1,
    })),
  };
}

describe("validateSheetSet 중복 차단(리뷰 #6)", () => {
  it("필수 시트 전부 + 중복 0 이면 ok", () => {
    const v = validateSheetSet([wbWithTypes([...REQUIRED_RAW_SHEETS])]);
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.duplicates).toEqual([]);
  });

  it("필수 시트 전부여도 같은 RAW 시트가 2개면 ok=false + duplicates 보고", () => {
    // 완전한 세트 + '매출상세' 중복 1개.
    const v = validateSheetSet([
      wbWithTypes([...REQUIRED_RAW_SHEETS, "매출상세"]),
    ]);
    expect(v.missing).toEqual([]);
    expect(v.duplicates).toContain("매출상세");
    expect(v.ok).toBe(false); // ← 핵심: 중복이 ok 에 반영되어 차단된다.
  });

  it("여러 워크북에 분산된 동일 시트도 중복으로 감지한다", () => {
    const v = validateSheetSet([
      wbWithTypes([...REQUIRED_RAW_SHEETS]),
      wbWithTypes(["점재고"]), // 다른 파일에 같은 타입 1개 더.
    ]);
    expect(v.duplicates).toContain("점재고");
    expect(v.ok).toBe(false);
  });

  it("누락이 있으면 종전대로 ok=false(missing 보고)", () => {
    const partial = REQUIRED_RAW_SHEETS.slice(0, 3);
    const v = validateSheetSet([wbWithTypes(partial)]);
    expect(v.ok).toBe(false);
    expect(v.missing.length).toBeGreaterThan(0);
  });
});
