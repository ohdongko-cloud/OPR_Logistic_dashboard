/**
 * 데이터 품질 가드 — 희소 분모 비율 표기 보류.
 *
 * 파생 비율(물류비율·재고일수·체화비중·판매율 등)이 분모가 미미할 때 14,000%·601일 같은
 * 오해성 극단값을 "—"(흐린 마커)로 가드. ★원본 값은 유지(데이터 손실 금지) — 표시만 가드.
 */

import { describe, it, expect } from "vitest";

import {
  RATIO_DENOM_MIN,
  guardRatio,
  shouldSuppressRatio,
  formatGuardedRatio,
} from "./metric-guard";

describe("metric-guard — 희소 분모 비율 가드", () => {
  it("분모가 임계 이상이면 비율을 그대로 통과시킨다", () => {
    const r = guardRatio(0.137, 1_000_000, RATIO_DENOM_MIN.amount);
    expect(r.suppressed).toBe(false);
    expect(r.value).toBe(0.137);
  });

  it("분모가 임계 미만이면 표기 보류(suppressed)하되 원본 값은 보존한다", () => {
    // 14,000% 같은 극단 비율 — 분모(매출) 미미.
    const r = guardRatio(140, 12_000, RATIO_DENOM_MIN.amount);
    expect(r.suppressed).toBe(true);
    expect(r.value).toBe(140); // 원본 보존(손실 금지)
    expect(r.reason).toContain("분모");
  });

  it("재고일수(601일)도 분모(소진액) 미미면 가드한다", () => {
    const r = guardRatio(601, 50_000, RATIO_DENOM_MIN.amount);
    expect(r.suppressed).toBe(true);
  });

  it("비율이 null(분모0=공란)이면 가드 아님(이미 빈칸) — suppressed=false, value=null", () => {
    const r = guardRatio(null, 0, RATIO_DENOM_MIN.amount);
    expect(r.suppressed).toBe(false);
    expect(r.value).toBeNull();
  });

  it("분모가 null/undefined 면(원천부재) 가드(보류)한다", () => {
    const r = guardRatio(0.5, null, RATIO_DENOM_MIN.amount);
    expect(r.suppressed).toBe(true);
  });

  it("shouldSuppressRatio — 분모 임계 미만 판정", () => {
    expect(shouldSuppressRatio(100, RATIO_DENOM_MIN.amount)).toBe(true);
    expect(shouldSuppressRatio(RATIO_DENOM_MIN.amount, RATIO_DENOM_MIN.amount)).toBe(false);
    expect(shouldSuppressRatio(null, RATIO_DENOM_MIN.amount)).toBe(true);
  });

  it("formatGuardedRatio — 보류면 '—' 반환(원본 포맷 미적용)", () => {
    const fmt = (v: number | null) => `${(v! * 100).toFixed(1)}%`;
    // 정상: 포맷 적용.
    expect(formatGuardedRatio(0.137, 1_000_000, RATIO_DENOM_MIN.amount, fmt)).toEqual({
      text: "13.7%",
      suppressed: false,
    });
    // 희소: '—'.
    expect(formatGuardedRatio(140, 12_000, RATIO_DENOM_MIN.amount, fmt).text).toBe("—");
    expect(formatGuardedRatio(140, 12_000, RATIO_DENOM_MIN.amount, fmt).suppressed).toBe(true);
  });

  it("수량 기준 임계는 금액 기준과 별도(작은 절대값)", () => {
    // 수량 분모(예: 입고량 5개)는 amount 임계보다 작아도 의미.
    expect(RATIO_DENOM_MIN.qty).toBeLessThan(RATIO_DENOM_MIN.amount);
    expect(shouldSuppressRatio(5, RATIO_DENOM_MIN.qty)).toBe(true); // 5개는 여전히 희소
    expect(shouldSuppressRatio(500, RATIO_DENOM_MIN.qty)).toBe(false);
  });
});
