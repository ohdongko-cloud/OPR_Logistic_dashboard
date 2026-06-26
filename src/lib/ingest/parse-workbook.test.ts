import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseWorkbook, buildRawRows } from "./parse-workbook";

/** aoa → 시트명 1개짜리 xlsx ArrayBuffer */
function buildXlsx(sheets: Record<string, (string | number | null)[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

// 매출상세분석 RAW 모형(r1~r7 + 데이터 2행)
const SALES_AOA: (string | number | null)[][] = [
  ["", "", "매출상세분석"],
  ["", "", "조회(일)", "2026-06-01 - 2026-06-21"],
  [1, 2],
  ["", "", "", "", "", "", "", "실 매출액", "총 매출원가", "판매수량"],
  ["", "", "계절연도+계절(Now)", "MC(자재그룹)(Now)", "", "구매그룹(Now:상품)", "", "KRW", "KRW"],
  // ⚠️ 합성(마스킹) 값 — 실파일 수치 아님(헌장 §4 로컬·마스킹). 구조만 모사.
  ["", "", "전체 결과", "", "", "", "", 9999, 8888, 777],
  ["20991-AAABB1", "AAAB", "20991", "AAABB1", "샘플상품", "BG0", "샘플등급", 1000, 2000, 10],
  ["20992-CCCDD2", "CCCD", "20992", "CCCDD2", "샘플상품2", "BG1", "샘플등급", 100, 200, 5],
];

describe("parseWorkbook — 시트 감지 + 헤더/데이터 분리", () => {
  it("매출상세 RAW를 감지하고 데이터행만(총계행 제외) 노출", () => {
    const buf = buildXlsx({ 매출상세분석: SALES_AOA });
    const wb = parseWorkbook(buf);
    const sales = wb.sheets.find((s) => s.detection.type === "매출상세");
    expect(sales).toBeDefined();
    // r6 총계행 제외, 데이터 2행
    expect(sales!.dataRows.length).toBe(2);
    expect(sales!.dataRows[0]![0]).toBe("20991-AAABB1");
  });

  it("buildRawRows — 데이터행을 RawRow 적재 구조체로 변환(skuKey·rowIndex)", () => {
    const buf = buildXlsx({ 매출상세분석: SALES_AOA });
    const wb = parseWorkbook(buf);
    const sales = wb.sheets.find((s) => s.detection.type === "매출상세")!;
    const rows = buildRawRows(sales);
    expect(rows.length).toBe(2);
    expect(rows[0]!.sheetType).toBe("매출상세");
    expect(rows[0]!.rowIndex).toBe(0);
    expect(rows[0]!.skuKey).toBe("20991-AAABB1");
    // data 는 컬럼문자→값 맵
    expect(rows[0]!.data.A).toBe("20991-AAABB1");
    expect(rows[0]!.data.H).toBe(1000);
  });

  it("매크로 코드네임 워크북은 거부", () => {
    // 일반 워크북엔 codeName 없음 → 통과. (음성 케이스만 단위검증)
    const buf = buildXlsx({ 매출상세분석: SALES_AOA });
    expect(() => parseWorkbook(buf)).not.toThrow();
  });

  it("행수 상한 초과 시 throw", () => {
    const big: (string | number | null)[][] = [];
    for (let i = 0; i < 12; i++) big.push(["a", "b", "c", "d", "e"]);
    const buf = buildXlsx({ 매출상세분석: big });
    expect(() => parseWorkbook(buf, { maxRows: 5 })).toThrow();
  });
});
