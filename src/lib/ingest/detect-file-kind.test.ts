/**
 * 업로드 파일 종류(아이템/매장) + 기간(당월/누적) 자동판별 단위 검증.
 *
 * 근거:
 *  - 아이템 파일: 칸반 `물류전체칸반(당월|누적)` + RAW 6시트(매출상세분석·점재고·물류재고·…).
 *  - 매장 파일: `매장전체칸반(당월)` + `수불오차`·`※지점대시보드`·`기말재고(지점)` 등 매장 고유시트.
 *    ※ 매장 파일도 `매출상세분석`·`기초재고(지점)` 시트를 갖지만 매장 고유시트로 구분.
 *  - 기간: 칸반 시트명 `(당월)` vs `(누적)`.
 *
 * 합성 워크북(시트명만)으로 판별 — 시트 시그니처가 아니라 시트명 셋으로 결정.
 */

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { detectFileKind } from "./detect-file-kind";

/** 시트명 목록만으로 합성 워크북 바이트 생성(각 시트에 더미셀 1개). */
function makeWorkbook(sheetNames: string[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const n of sheetNames) {
    const ws = XLSX.utils.aoa_to_sheet([[1]]);
    // 31자 시트명 제한 회피 — 잘라서 append(판별은 includes 기반).
    XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}

const ITEM_MONTH_SHEETS = [
  "대시보드",
  "물류전체칸반(당월)",
  "매출상세분석",
  "점재고",
  "물류재고",
  "센터입출고",
  "기초재고(지점)",
  "기초재고(센터)",
];
const ITEM_CUM_SHEETS = ITEM_MONTH_SHEETS.map((n) =>
  n === "물류전체칸반(당월)" ? "물류전체칸반(누적)" : n,
);
const STORE_SHEETS = [
  "지점대시보드",
  "매장전체칸반(당월)",
  "매출상세분석",
  "기말재고(지점)",
  "기초재고(지점)",
  "상품수불(지점)",
  "수불오차",
];

describe("detectFileKind — 파일 종류·기간 자동판별", () => {
  it("아이템 당월 파일 → kind=item, period=MONTH", () => {
    const res = detectFileKind(makeWorkbook(ITEM_MONTH_SHEETS));
    expect(res.kind).toBe("item");
    expect(res.period).toBe("MONTH");
  });

  it("아이템 누적 파일 → kind=item, period=CUMULATIVE", () => {
    const res = detectFileKind(makeWorkbook(ITEM_CUM_SHEETS));
    expect(res.kind).toBe("item");
    expect(res.period).toBe("CUMULATIVE");
  });

  it("매장 파일 → kind=store, period=MONTH (매출상세분석 공유에도 매장으로)", () => {
    const res = detectFileKind(makeWorkbook(STORE_SHEETS));
    expect(res.kind).toBe("store");
    expect(res.period).toBe("MONTH");
  });

  it("알 수 없는 파일 → kind=unknown", () => {
    const res = detectFileKind(makeWorkbook(["Sheet1", "잡다한탭"]));
    expect(res.kind).toBe("unknown");
  });
});
