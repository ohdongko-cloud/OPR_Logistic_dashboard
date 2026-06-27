/**
 * 집계(롤업)행 배경 톤 probe — aggRowBg.
 *
 * UI 피드백 ②: 자식 있는 노드(전체·성별·시즌 등 비-리프)에 행 전체 배경색 부여,
 *   리프(상세=아이템/SKU/점포)는 흰 배경으로 뚜렷이 구분. 상위일수록 진한 단계 톤.
 */

import { describe, expect, it } from "vitest";

import { AGG_BG, aggRowBg } from "./row-tone";

describe("aggRowBg — 리프=흰배경 · 집계=단계 톤", () => {
  it("리프(상세행)는 흰 배경 — 집계 톤 없음", () => {
    expect(aggRowBg({ isLeaf: true, depth: 0 })).toBe("bg-white");
    expect(aggRowBg({ isLeaf: true, depth: 3 })).toBe("bg-white");
  });

  it("집계행(비-리프) depth 0~4 → 단계 톤(L0~L4)", () => {
    expect(aggRowBg({ isLeaf: false, depth: 0 })).toBe(AGG_BG[0]);
    expect(aggRowBg({ isLeaf: false, depth: 1 })).toBe(AGG_BG[1]);
    expect(aggRowBg({ isLeaf: false, depth: 2 })).toBe(AGG_BG[2]);
    expect(aggRowBg({ isLeaf: false, depth: 3 })).toBe(AGG_BG[3]);
    expect(aggRowBg({ isLeaf: false, depth: 4 })).toBe(AGG_BG[4]);
  });

  it("깊이 초과(>4)는 가장 옅은 톤으로 클램프", () => {
    expect(aggRowBg({ isLeaf: false, depth: 7 })).toBe(AGG_BG[4]);
  });

  it("음수 깊이 방어 → 가장 진한 톤(L0)", () => {
    expect(aggRowBg({ isLeaf: false, depth: -1 })).toBe(AGG_BG[0]);
  });

  it("상위(L0)가 하위(L4)와 다른 톤 — 단계 대비 보장", () => {
    expect(AGG_BG[0]).not.toBe(AGG_BG[4]);
  });

  it("모든 단계 톤은 agg-l* 토큰 — 흰배경/grid 톤과 구분", () => {
    for (const cls of AGG_BG) expect(cls).toMatch(/^bg-agg-l[0-4]$/);
  });
});
