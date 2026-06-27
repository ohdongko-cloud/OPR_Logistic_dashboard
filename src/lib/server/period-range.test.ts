/**
 * resolvePeriodRange 멱등 키 정규화(리뷰 #4) — periodEnd 가 논리적 기간으로 고정되는지.
 *
 * 핵심: 같은 논리적 기간(같은 월/연)을 '다른 업로드 날짜'로 적재해도 periodEnd 가 동일해야
 *   supersede 가 이전 CURRENT 를 정확히 찾는다(중복 CURRENT 누적 방지).
 */

import { describe, expect, it } from "vitest";

import { resolvePeriodRange } from "./period-range";

const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe("resolvePeriodRange periodEnd 정규화(리뷰 #4 멱등)", () => {
  it("MONTH: 같은 월의 어떤 날짜를 줘도 periodEnd 는 그 달 말일", () => {
    const a = resolvePeriodRange("MONTH", null, "2026-06-03");
    const b = resolvePeriodRange("MONTH", null, "2026-06-27");
    expect(iso(a.periodEnd)).toBe("2026-06-30");
    expect(iso(b.periodEnd)).toBe("2026-06-30");
    // 멱등: 같은 달이면 동일 periodEnd → supersede 정확 매칭.
    expect(iso(a.periodEnd)).toBe(iso(b.periodEnd));
  });

  it("MONTH: 2월 말일(평년·윤년) 정확", () => {
    expect(iso(resolvePeriodRange("MONTH", null, "2026-02-10").periodEnd)).toBe("2026-02-28");
    expect(iso(resolvePeriodRange("MONTH", null, "2024-02-10").periodEnd)).toBe("2024-02-29");
  });

  it("CUMULATIVE: 연중 어떤 날짜를 줘도 periodEnd 는 연말(12/31)", () => {
    const a = resolvePeriodRange("CUMULATIVE", null, "2026-03-15");
    const b = resolvePeriodRange("CUMULATIVE", null, "2026-11-01");
    expect(iso(a.periodEnd)).toBe("2026-12-31");
    expect(iso(b.periodEnd)).toBe("2026-12-31");
    expect(iso(a.periodEnd)).toBe(iso(b.periodEnd));
  });

  it("endStr 미상이면 now 앵커로 정규화(MONTH=월말)", () => {
    const fixedNow = new Date("2026-06-15T09:00:00Z");
    const r = resolvePeriodRange("MONTH", null, null, fixedNow);
    expect(iso(r.periodEnd)).toBe("2026-06-30");
  });

  it("periodStart: start 미상이면 MONTH=월초·CUMULATIVE=연초", () => {
    expect(iso(resolvePeriodRange("MONTH", null, "2026-06-15").periodStart)).toBe("2026-06-01");
    expect(iso(resolvePeriodRange("CUMULATIVE", null, "2026-06-15").periodStart)).toBe("2026-01-01");
  });

  it("명시 start 는 보존하되 periodEnd 는 여전히 정규화", () => {
    const r = resolvePeriodRange("MONTH", "2026-06-05", "2026-06-20");
    expect(iso(r.periodStart)).toBe("2026-06-05");
    expect(iso(r.periodEnd)).toBe("2026-06-30");
  });
});
