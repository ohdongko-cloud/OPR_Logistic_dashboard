/**
 * 집계(롤업)행 배경 톤 probe — aggRowBg.
 *
 * 재설계(MI Reorder v2 양식): 집계행 배경은 "밝고 subtle"하되 **레벨별로 뚜렷이 다른 cool 톤**으로
 *   트리 깊이를 한눈에 구분한다(이전: 너무 어둡고 레벨별 동일색 → 구분 안 됨 피드백).
 *   리프(상세=아이템/SKU/시즌말단)는 흰 배경. 글씨는 진한색(zinc-800 bold) → 밝은 배경 위 대비 충분.
 *   톤 값은 globals.css --agg-l0..l4(라이트/다크 분기), 대비(WCAG)는 globals.css 주석 probe 참조.
 */

import { describe, expect, it } from "vitest";

import { AGG_BG, aggRowBg } from "./row-tone";

describe("aggRowBg — 리프=흰배경 · 집계=레벨별 distinct 톤", () => {
  it("리프(상세행)는 흰 배경 — 집계 톤 없음", () => {
    expect(aggRowBg({ isLeaf: true, depth: 0 })).toBe("bg-white");
    expect(aggRowBg({ isLeaf: true, depth: 3 })).toBe("bg-white");
  });

  it("집계행(비-리프) depth 0~4 → 레벨 톤(L0~L4)", () => {
    expect(aggRowBg({ isLeaf: false, depth: 0 })).toBe(AGG_BG[0]);
    expect(aggRowBg({ isLeaf: false, depth: 1 })).toBe(AGG_BG[1]);
    expect(aggRowBg({ isLeaf: false, depth: 2 })).toBe(AGG_BG[2]);
    expect(aggRowBg({ isLeaf: false, depth: 3 })).toBe(AGG_BG[3]);
    expect(aggRowBg({ isLeaf: false, depth: 4 })).toBe(AGG_BG[4]);
  });

  it("깊이 초과(>4)는 가장 옅은(깊은) 톤으로 클램프", () => {
    expect(aggRowBg({ isLeaf: false, depth: 7 })).toBe(AGG_BG[4]);
  });

  it("음수 깊이 방어 → L0 톤", () => {
    expect(aggRowBg({ isLeaf: false, depth: -1 })).toBe(AGG_BG[0]);
  });

  it("모든 레벨 톤이 상호 distinct — 트리 깊이 구분(피드백 핵심)", () => {
    const seen = new Set(AGG_BG);
    expect(seen.size).toBe(AGG_BG.length);
  });

  it("리프(흰배경)는 어떤 집계 톤과도 겹치지 않음", () => {
    expect(AGG_BG).not.toContain("bg-white");
  });

  it("모든 레벨 톤은 agg-l* 토큰 — 흰배경/grid 톤과 구분", () => {
    for (const cls of AGG_BG) expect(cls).toMatch(/^bg-agg-l[0-4]$/);
  });
});
