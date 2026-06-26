import { describe, expect, it } from "vitest";

import { compareToTarget } from "./compare";

describe("compareToTarget — 목표대비 ▲▼·달성률", () => {
  it("매출(높을수록 좋음): 현재>목표 → 달성, 양수 delta", () => {
    const r = compareToTarget("sales", 120, 100);
    expect(r).not.toBeNull();
    expect(r!.delta).toBe(20);
    expect(r!.achievedPct).toBeCloseTo(1.2, 5); // 120/100
    expect(r!.direction).toBe("up");
    expect(r!.good).toBe(true);
  });

  it("매출: 현재<목표 → 미달, 음수 delta, good=false", () => {
    const r = compareToTarget("sales", 80, 100);
    expect(r!.delta).toBe(-20);
    expect(r!.direction).toBe("down");
    expect(r!.good).toBe(false);
  });

  it("물류비율(낮을수록 좋음): 현재<목표 → 달성(good), 달성률은 목표/현재", () => {
    const r = compareToTarget("logiRatio", 0.1, 0.12);
    expect(r!.delta).toBeCloseTo(-0.02, 5);
    expect(r!.direction).toBe("down");
    expect(r!.good).toBe(true); // 비용성 지표는 낮을수록 달성
    // 비용성 달성률 = 목표/현재 (100% 이상이면 목표보다 효율적)
    expect(r!.achievedPct).toBeCloseTo(0.12 / 0.1, 5);
  });

  it("물류비율: 현재>목표 → 미달(good=false)", () => {
    const r = compareToTarget("logiRatio", 0.15, 0.12);
    expect(r!.direction).toBe("up");
    expect(r!.good).toBe(false);
  });

  it("목표=0 또는 null 이면 비교 불가(null)", () => {
    expect(compareToTarget("sales", 100, 0)).toBeNull();
    expect(compareToTarget("sales", 100, null)).toBeNull();
  });

  it("현재값 null 이면 비교 불가(null)", () => {
    expect(compareToTarget("logiRatio", null, 0.12)).toBeNull();
  });

  it("현재=목표 → flat, delta 0, good=true", () => {
    const r = compareToTarget("sales", 100, 100);
    expect(r!.delta).toBe(0);
    expect(r!.direction).toBe("flat");
    expect(r!.good).toBe(true);
  });
});
