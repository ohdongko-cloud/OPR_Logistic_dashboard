/**
 * 엑셀 내보내기 비율 가드 (C14) 단위테스트 — 화면 metric-guard 와 동일 동작.
 */

import { describe, expect, it } from "vitest";

import { guardedExportCell } from "./export-guard";
import { RATIO_DENOM_MIN, SUPPRESS_MARK } from "./metric-guard";

const fmtPct = (v: number | null) => (v == null ? "" : Number((v * 100).toFixed(2)));
const fmtNum = (v: number | null) => (v == null ? "" : Number(v.toFixed(2)));

describe("guardedExportCell — 희소 분모 비율 셀 가드", () => {
  it("가드 비대상(min=null) → 원시 포맷값 그대로(비-비율 원시값 보존)", () => {
    expect(guardedExportCell(12345, undefined, null, fmtNum)).toBe(12345);
    expect(guardedExportCell(null, undefined, null, fmtNum)).toBe("");
  });

  it("분모 충분 → 포맷된 비율값", () => {
    // 분모 1억(>임계 1백만) → 정상.
    expect(guardedExportCell(0.34, 100_000_000, RATIO_DENOM_MIN.amount, fmtPct)).toBe(34);
  });

  it("분모 미미(amount) → SUPPRESS_MARK('—') (화면과 동일)", () => {
    // 분모 12,000원 < 임계 1백만 → 보류.
    expect(guardedExportCell(140, 12_000, RATIO_DENOM_MIN.amount, fmtPct)).toBe(SUPPRESS_MARK);
  });

  it("분모 미미(qty) → SUPPRESS_MARK", () => {
    // 재고량 3개 < 임계 50 → 보류.
    expect(guardedExportCell(0.5, 3, RATIO_DENOM_MIN.qty, fmtPct)).toBe(SUPPRESS_MARK);
  });

  it("이미 null(분모0 IFERROR 공란) → 빈칸(가드 무관)", () => {
    expect(guardedExportCell(null, 0, RATIO_DENOM_MIN.amount, fmtPct)).toBe("");
  });

  it("분모 null/undefined → 보류(분모 부재도 희소 취급)", () => {
    expect(guardedExportCell(140, null, RATIO_DENOM_MIN.amount, fmtPct)).toBe(SUPPRESS_MARK);
    expect(guardedExportCell(140, undefined, RATIO_DENOM_MIN.amount, fmtPct)).toBe(SUPPRESS_MARK);
  });
});
