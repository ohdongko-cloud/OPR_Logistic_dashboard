import { readFileSync, existsSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { ingestFiles } from "./ingest-files";

function xlsxBytes(sheets: Record<string, (string | number | null)[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("ingestFiles — 파일세트 오케스트레이션", () => {
  it("bad magic 파일은 차단", () => {
    const r = ingestFiles([
      { name: "fake.xlsx", size: 10, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    ]);
    expect(r.ok).toBe(false);
    expect(r.files[0]!.error).toBe("bad_magic");
  });

  it("필수 RAW 시트 누락 시 ok=false + missing 리포트", () => {
    const bytes = xlsxBytes({
      매출상세분석: [
        ["", "", "매출상세분석"],
        [],
        [],
        ["", "", "", "", "", "", "", "실 매출액", "총 매출원가", "판매수량"],
        ["", "", "계절연도+계절(Now)", "MC(자재그룹)(Now)"],
        ["", "", "전체 결과"],
        ["20991-X", "BK", "20991", "X", "a", "BG0", "샘플등급", 1, 2, 3],
      ],
    });
    const r = ingestFiles([{ name: "a.xlsx", size: bytes.length, bytes }]);
    expect(r.ok).toBe(false);
    expect(r.sheetSet.missing).toContain("점재고");
  });

  // 실파일 통합 — 단일 통합 워크북이 6 RAW 전부 포함 → ok
  const REAL =
    "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";
  it.skipIf(!existsSync(REAL))("실파일(통합) 1건이면 6 RAW 충족 → ok, totalRows>0", () => {
    const buf = readFileSync(REAL);
    const r = ingestFiles([
      {
        name: "당월.xlsx",
        size: buf.length,
        bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      },
    ]);
    expect(r.sheetSet.missing).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.totalRows).toBeGreaterThan(10000);
    // 매출상세 적재 구조체 1797건
    expect(r.records["매출상세"]?.length).toBe(1797);
  });
});
