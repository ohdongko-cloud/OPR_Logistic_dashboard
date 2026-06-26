/**
 * 표 XML 셀 텍스트 치환 — 서식 보존 surgery 단위 테스트.
 */

import { describe, expect, it } from "vitest";

import { findTableRanges, getCellText, setCellText } from "./table-xml";

// 최소 OOXML 표 골격(2행 × 2열). 서식 속성(rPr/tcPr)은 보존 대상.
const SAMPLE = [
  "<a:tbl>",
  "<a:tblGrid><a:gridCol w='100'/><a:gridCol w='100'/></a:tblGrid>",
  // r0
  "<a:tr h='10'>",
  "<a:tc><a:txBody><a:p><a:r><a:rPr sz='950' b='1'/><a:t>전체</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>",
  "<a:tc><a:txBody><a:p><a:r><a:rPr sz='950'/><a:t>395</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>",
  "</a:tr>",
  // r1
  "<a:tr h='10'>",
  "<a:tc><a:txBody><a:p><a:r><a:rPr sz='950'/><a:t>여성</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>",
  "<a:tc><a:txBody><a:p></a:p></a:txBody><a:tcPr/></a:tc>", // 빈 셀(런 없음)
  "</a:tr>",
  "</a:tbl>",
].join("");

describe("table-xml surgery", () => {
  it("표 구조(행·셀 범위)를 파싱한다", () => {
    const t = findTableRanges(SAMPLE);
    expect(t.rows.length).toBe(2);
    expect(t.rows[0]!.cells.length).toBe(2);
    expect(t.rows[1]!.cells.length).toBe(2);
  });

  it("셀 텍스트를 읽는다", () => {
    const t = findTableRanges(SAMPLE);
    expect(getCellText(SAMPLE, t, 0, 0)).toBe("전체");
    expect(getCellText(SAMPLE, t, 0, 1)).toBe("395");
    expect(getCellText(SAMPLE, t, 1, 1)).toBe(""); // 런 없는 빈 셀
  });

  it("셀 텍스트를 치환하되 서식 속성(rPr)을 보존한다", () => {
    const t = findTableRanges(SAMPLE);
    const out = setCellText(SAMPLE, t, 0, 1, "6,582");
    // 값만 바뀌고 rPr·sz 등 서식은 유지
    expect(out).toContain("<a:rPr sz='950'/><a:t>6,582</a:t>");
    expect(out).toContain("<a:rPr sz='950' b='1'/><a:t>전체</a:t>"); // 다른 셀 불변
    // 재파싱 후 값 확인
    const t2 = findTableRanges(out);
    expect(getCellText(out, t2, 0, 1)).toBe("6,582");
  });

  it("연쇄 치환이 좌표를 어긋나게 하지 않는다(길이 변동 누적)", () => {
    const t = findTableRanges(SAMPLE);
    let out = setCellText(SAMPLE, t, 0, 1, "VERY_LONG_VALUE_1234567890");
    // 같은 표를 다시 파싱해 두 번째 셀 치환
    const t2 = findTableRanges(out);
    out = setCellText(out, t2, 0, 0, "X");
    const t3 = findTableRanges(out);
    expect(getCellText(out, t3, 0, 1)).toBe("VERY_LONG_VALUE_1234567890");
    expect(getCellText(out, t3, 0, 0)).toBe("X");
  });

  it("XML 특수문자를 이스케이프한다", () => {
    const t = findTableRanges(SAMPLE);
    const out = setCellText(SAMPLE, t, 0, 1, "a<b&c>d");
    expect(out).toContain("a&lt;b&amp;c&gt;d");
    const t2 = findTableRanges(out);
    expect(getCellText(out, t2, 0, 1)).toBe("a<b&c>d");
  });

  it("런이 없는 빈 셀에 setCellText 하면 새 런을 만들지 않고 안전하게 무시한다", () => {
    const t = findTableRanges(SAMPLE);
    // 빈 셀(1,1)은 주입 대상 아님(원본도 빈칸) — 호출 시 변경 없음 + 경고 반환
    const res = setCellText(SAMPLE, t, 1, 1, "999", { skipIfNoRun: true });
    expect(res).toBe(SAMPLE); // 변경 없음
  });
});
