import { describe, expect, it } from "vitest";

import { detectSheetType } from "./detect";

/** RAW 탭 r1~r6 헤더 묶음(실측 기반 축약본). */
const SALES_HEADER_ROWS = [
  ["", "", "매출상세분석"],
  ["", "", "조회(일)", "2026-06-01 - 2026-", "구매그룹"],
  ["1", "2"],
  ["", "", "", "", "", "", "", "실 매출액", "총 매출원가", "판매수량"],
  ["", "", "계절연도+계절(Now)", "MC(자재그룹)(Now)", "", "구매그룹(Now:상품)", "", "KRW", "KRW"],
  ["", "", "전체 결과"],
];

const STORE_INV_HEADER_ROWS = [
  ["", "", "일재고분석"],
  ["", "", "조회(일)", "2026-06-21"],
  ["1", "2"],
  ["", "", "", "", "", "", "", "재고량", "재고액\n(V-,원가)\n", "재고액\n[최초판매가]"],
  ["", "", "계절연도+계절(Now)", "MC(자재그룹)(Now)", "", "", "", "", "KRW", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "체화량", "체화액"],
  ["", "", "전체 결과"],
];

const INOUT_HEADER_ROWS = [
  ["", "", "일상품수불장"],
  ["", "", "조회(일)", "2026-06-01 - 2026-"],
  ["1", "2"],
  ["", "", "", "", "", "", "", "벤더입고액\n(V-,원가)", "벤더입고량", "점간입고액\n(V-,원가)", "점간입고량", "점간출고액\n(V-,원가)", "점간출고량"],
  ["", "", "계절연도+계절(Now)", "MC(자재그룹)(Now)"],
  ["", "", "전체 결과"],
];

describe("detectSheetType — 헤더 시그니처 자동 판별 (R1 핀고정)", () => {
  it("매출상세분석 RAW 헤더를 '매출상세'로 판별", () => {
    const r = detectSheetType(SALES_HEADER_ROWS, "매출상세분석");
    expect(r.type).toBe("매출상세");
    expect(r.confidence).toBe(1);
  });

  it("점재고 RAW(체화 보유) 헤더를 재고탭으로 판별하고 시트명으로 점재고 확정", () => {
    const r = detectSheetType(STORE_INV_HEADER_ROWS, "점재고");
    expect(r.type).toBe("점재고");
  });

  it("물류재고는 점재고와 동일 측정라벨이나 시트명으로 구분", () => {
    const r = detectSheetType(STORE_INV_HEADER_ROWS, "물류재고");
    expect(r.type).toBe("물류재고");
  });

  it("센터입출고 RAW 헤더를 '센터입출고'로 판별", () => {
    const r = detectSheetType(INOUT_HEADER_ROWS, "센터입출고");
    expect(r.type).toBe("센터입출고");
  });

  it("기초재고(센터)는 시트명 힌트로 구분(헤더는 재고탭과 유사)", () => {
    const baseRows = STORE_INV_HEADER_ROWS.map((r) => [...r]);
    const r = detectSheetType(baseRows, "기초재고(센터)");
    expect(r.type).toBe("기초재고_센터");
  });

  it("어떤 시그니처와도 안 맞고 시트명도 모르면 null", () => {
    const junk = [["티코드", "내역", "메뉴", "권한", "비고"]];
    const r = detectSheetType(junk, "참조탭");
    expect(r.type).toBeNull();
  });
});
