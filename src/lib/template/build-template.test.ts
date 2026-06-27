/**
 * 템플릿 .xlsx 가 유효히 열리고, 시트·헤더가 **파서 기대와 일치**하는지 검증.
 *
 * 핵심 회귀 보증:
 *  - 아이템 6 RAW 시트가 detectSheetType 으로 올바른 SheetType 에 판별된다(헤더 시그니처 통과).
 *  - 헤더가 정확한 열 letter(파서 좌표)에 박혀 있다(매출상세 H=실매출액 등 측정열 · A=조인키).
 *  - 매장 5 RAW 시트가 ingest-store 의 이름매칭으로 찾아지고, 블록 키/측정열이 정합.
 *  - detectFileKind 가 시트셋만으로 종류를 식별(README 추가가 오탐을 일으키지 않음).
 *  - 실데이터 0(헤더·예시 더미만).
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

import { detectSheetType } from "@/lib/ingest/detect";
import { MEASURE_COLUMNS, DIM_COLUMNS } from "@/lib/engine/raw-columns";
import { buildTemplateWorkbook, templateFileName } from "./build-template";
import { ITEM_TEMPLATE, STORE_TEMPLATE } from "./template-spec";

/** 워크북 바이트 → AOA(시트별). */
function readSheets(bytes: Uint8Array): Record<string, (string | number | null)[][]> {
  const wb = XLSX.read(bytes, { type: "array" });
  const out: Record<string, (string | number | null)[][]> = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name]!, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true, // 절대 행 위치 보존(아이템 헤더=4행=인덱스3).
    });
  }
  return out;
}

function colIdx(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

describe("업로드 양식 템플릿 — 유효성·파서 정합", () => {
  it("아이템 템플릿이 유효 .xlsx 로 열리고 README + 6 RAW 시트를 포함한다", () => {
    const bytes = buildTemplateWorkbook("item")!;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames[0]).toBe("README(안내)");
    for (const sheet of ITEM_TEMPLATE.sheets) {
      expect(wb.SheetNames).toContain(sheet.name);
    }
  });

  it("아이템 6 RAW 시트가 detectSheetType 으로 올바른 SheetType 에 판별된다", () => {
    const bytes = buildTemplateWorkbook("item")!;
    const wb = XLSX.read(bytes, { type: "array" });

    // sheet-types SheetType ← template 시트명 매핑.
    const expected: Record<string, string> = {
      매출상세분석: "매출상세",
      점재고: "점재고",
      물류재고: "물류재고",
      센터입출고: "센터입출고",
      "기초재고(지점)": "기초재고_지점",
      "기초재고(센터)": "기초재고_센터",
    };

    for (const [sheetName, type] of Object.entries(expected)) {
      const ws = wb.Sheets[sheetName]!;
      const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
        header: 1,
        defval: null,
        raw: true,
      });
      const headerRows = aoa.slice(0, 6);
      const det = detectSheetType(headerRows, sheetName);
      expect(det.type, `${sheetName} → ${det.reason}`).toBe(type);
    }
  });

  it("아이템 헤더가 파서 측정열(MEASURE_COLUMNS) letter 에 정확히 박혀 있다", () => {
    const bytes = buildTemplateWorkbook("item")!;
    const sheets = readSheets(bytes);

    const checks: Array<{ sheet: string; col: string; mustInclude: string }> = [
      { sheet: "매출상세분석", col: MEASURE_COLUMNS.매출상세.sales, mustInclude: "실매출액" },
      { sheet: "매출상세분석", col: MEASURE_COLUMNS.매출상세.cogs, mustInclude: "총매출원가" },
      { sheet: "매출상세분석", col: MEASURE_COLUMNS.매출상세.qty, mustInclude: "판매수량" },
      { sheet: "물류재고", col: MEASURE_COLUMNS.물류재고.qty, mustInclude: "재고량" },
      { sheet: "물류재고", col: MEASURE_COLUMNS.물류재고.deadQty, mustInclude: "체화량" },
      { sheet: "점재고", col: MEASURE_COLUMNS.점재고.qty, mustInclude: "재고량" },
      { sheet: "센터입출고", col: MEASURE_COLUMNS.센터입출고.inAmt, mustInclude: "벤더입고액" },
      { sheet: "센터입출고", col: MEASURE_COLUMNS.센터입출고.inQty, mustInclude: "벤더입고량" },
      { sheet: "기초재고(센터)", col: MEASURE_COLUMNS.기초재고_센터.amt, mustInclude: "재고액" },
      { sheet: "기초재고(지점)", col: MEASURE_COLUMNS.기초재고_지점.amt, mustInclude: "재고액" },
    ];

    for (const ck of checks) {
      const aoa = sheets[ck.sheet]!;
      // 아이템 RAW 헤더는 4행(인덱스 3).
      const headerRow = aoa[3] ?? [];
      const cell = headerRow[colIdx(ck.col)];
      expect(String(cell ?? ""), `${ck.sheet}!${ck.col}`).toContain(ck.mustInclude);
    }
  });

  it("아이템 분류열(DIM_COLUMNS)·조인키 A·구매그룹 F 헤더가 정확한 위치에 있다", () => {
    const bytes = buildTemplateWorkbook("item")!;
    const sheets = readSheets(bytes);

    // 매출상세 분류열 O/R/T/U.
    const salesDim = DIM_COLUMNS["매출상세"]!;
    const salesHeader = sheets["매출상세분석"]![3] ?? [];
    expect(String(salesHeader[colIdx(salesDim.daegubun)] ?? "")).toContain("대구분");
    expect(String(salesHeader[colIdx(salesDim.season)] ?? "")).toContain("시즌");

    // 조인키 A·구매그룹 F (모든 RAW 공통).
    for (const sheet of ITEM_TEMPLATE.sheets) {
      const header = sheets[sheet.name]![3] ?? [];
      expect(String(header[colIdx("A")] ?? ""), `${sheet.name}!A`).toContain("SKU키");
    }
    // 센터입출고 분류열 R/U/W/X.
    const ctrDim = DIM_COLUMNS["센터입출고"]!;
    const ctrHeader = sheets["센터입출고"]![3] ?? [];
    expect(String(ctrHeader[colIdx(ctrDim.daegubun)] ?? "")).toContain("대구분");
  });

  it("매장 5 RAW 시트가 포함되고 블록 키/측정열이 spec 좌표에 박혀 있다", () => {
    const bytes = buildTemplateWorkbook("store")!;
    const wb = XLSX.read(bytes, { type: "array" });
    for (const sheet of STORE_TEMPLATE.sheets) {
      expect(wb.SheetNames).toContain(sheet.name);
    }

    const sheets = readSheets(bytes);
    // 매출상세분석: 픽스 B(키)·D 실매출액 / 전체 I(키)·K 실매출액. 헤더 4행(인덱스3).
    const salesH = sheets["매출상세분석"]![3] ?? [];
    expect(String(salesH[colIdx("B")] ?? "")).toContain("점포코드");
    expect(String(salesH[colIdx("D")] ?? "")).toContain("실매출액");
    expect(String(salesH[colIdx("I")] ?? "")).toContain("점포코드");
    expect(String(salesH[colIdx("K")] ?? "")).toContain("실매출액");

    // 수불오차: B 구매그룹코드 / C 지점명 / G (−)수량 / H (−)금액. 데이터 5행 → 헤더 4행(인덱스3).
    const errH = sheets["수불오차"]![3] ?? [];
    expect(String(errH[colIdx("B")] ?? "")).toContain("구매그룹코드");
    expect(String(errH[colIdx("C")] ?? "")).toContain("지점명");
    expect(String(errH[colIdx("G")] ?? "")).toContain("수량");
    expect(String(errH[colIdx("H")] ?? "")).toContain("금액");
  });

  it("템플릿 파일명이 종류별로 구분된다", () => {
    expect(templateFileName("item")).toContain("아이템");
    expect(templateFileName("store")).toContain("매장");
    expect(templateFileName("item")).toMatch(/\.xlsx$/);
  });

  it("미지원 kind 는 null 을 반환한다", () => {
    expect(buildTemplateWorkbook("bogus" as never)).toBeNull();
  });
});
