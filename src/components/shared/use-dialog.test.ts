/**
 * 모달 포커스 트랩 키보드 probe — nextTrapFocus 순수 로직 검증.
 *
 * 접근성: Tab/Shift+Tab 가 패널 경계에서 순환(wrap)하고, 패널 밖 포커스는 다시 가둬지는지.
 */

import { describe, expect, it } from "vitest";

import { nextTrapFocus } from "./use-dialog";

describe("nextTrapFocus — 포커스 트랩(키보드 probe)", () => {
  const N = 3; // 첫=0, 마지막=2

  it("Tab: 마지막 요소에서 → 첫 요소(wrap)", () => {
    expect(nextTrapFocus({ count: N, activeIndex: 2, shift: false })).toBe(0);
  });

  it("Tab: 중간 요소에서 → null(기본 Tab 허용)", () => {
    expect(nextTrapFocus({ count: N, activeIndex: 0, shift: false })).toBeNull();
    expect(nextTrapFocus({ count: N, activeIndex: 1, shift: false })).toBeNull();
  });

  it("Shift+Tab: 첫 요소에서 → 마지막 요소(wrap)", () => {
    expect(nextTrapFocus({ count: N, activeIndex: 0, shift: true })).toBe(2);
  });

  it("Shift+Tab: 중간/마지막에서 → null(기본 허용)", () => {
    expect(nextTrapFocus({ count: N, activeIndex: 1, shift: true })).toBeNull();
    expect(nextTrapFocus({ count: N, activeIndex: 2, shift: true })).toBeNull();
  });

  it("패널 밖(activeIndex=-1): Tab→첫 · Shift+Tab→마지막 (배경으로 새지 않음)", () => {
    expect(nextTrapFocus({ count: N, activeIndex: -1, shift: false })).toBe(0);
    expect(nextTrapFocus({ count: N, activeIndex: -1, shift: true })).toBe(2);
  });

  it("포커스 가능 요소 없음(count=0): -1(컨테이너에 가둠)", () => {
    expect(nextTrapFocus({ count: 0, activeIndex: -1, shift: false })).toBe(-1);
    expect(nextTrapFocus({ count: 0, activeIndex: -1, shift: true })).toBe(-1);
  });

  it("단일 요소(count=1): 어느 방향이든 자기 자신으로 wrap", () => {
    expect(nextTrapFocus({ count: 1, activeIndex: 0, shift: false })).toBe(0);
    expect(nextTrapFocus({ count: 1, activeIndex: 0, shift: true })).toBe(0);
  });
});
