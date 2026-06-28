/**
 * 가로 스크롤 동기(상단 프록시 ↔ 테이블 본문) 순수 로직 probe.
 *
 * UI 피드백: 페이지 전체 세로 스크롤로 인해 테이블 가로 스크롤바가 본문 맨 아래에만 있어,
 *   넓은 지표열을 보려면 한참 내려야 했다. → 헤더 위 sticky 상단 프록시 스크롤바를 추가하고
 *   본문 컨테이너와 scrollLeft 를 양방향 동기한다.
 *
 * 동기 로직 중 브라우저 의존 없는 순수부(클램프·적용여부 게이트)만 분리해 node 환경에서 검증한다
 *   (use-table-density 의 densityTokens 분리 전략과 동일). DOM 결선은 useHScrollSync 훅이 담당.
 */

import { describe, expect, it } from "vitest";

import {
  PROXY_THRESHOLD_PX,
  clampScrollLeft,
  shouldApplySync,
} from "./scroll-sync";

describe("clampScrollLeft — 동기 목표 scrollLeft 클램프(음수·초과 방지)", () => {
  it("범위 내 값은 그대로", () => {
    expect(clampScrollLeft(120, 500)).toBe(120);
    expect(clampScrollLeft(0, 500)).toBe(0);
    expect(clampScrollLeft(500, 500)).toBe(500);
  });

  it("음수 → 0 으로 클램프", () => {
    expect(clampScrollLeft(-30, 500)).toBe(0);
  });

  it("최대 초과 → 최대로 클램프", () => {
    expect(clampScrollLeft(640, 500)).toBe(500);
  });

  it("max 가 0(스크롤 불필요) 이면 항상 0", () => {
    expect(clampScrollLeft(120, 0)).toBe(0);
    expect(clampScrollLeft(-5, 0)).toBe(0);
  });

  it("max 가 음수(비정상)면 0 으로 안전화", () => {
    expect(clampScrollLeft(50, -10)).toBe(0);
  });
});

describe("shouldApplySync — 동일값 재기록 방지(루프·불필요 write 차단)", () => {
  it("현재값과 목표값이 같으면 적용 안 함(루프 방지)", () => {
    expect(shouldApplySync(120, 120)).toBe(false);
    expect(shouldApplySync(0, 0)).toBe(false);
  });

  it("값이 다르면 적용", () => {
    expect(shouldApplySync(120, 121)).toBe(true);
    expect(shouldApplySync(0, 8)).toBe(true);
  });

  it("1px 미만 미세차(서브픽셀)는 무시 — 같은 것으로 취급", () => {
    expect(shouldApplySync(120, 120.4)).toBe(false);
    expect(shouldApplySync(120.6, 120)).toBe(false);
  });
});

describe("PROXY_THRESHOLD_PX — 프록시 노출 임계 계약", () => {
  it("넘침이 임계 이하면 프록시 불필요(상수 노출)", () => {
    // 작은 오버플로(반올림 오차 등)에는 프록시를 띄우지 않는다.
    expect(PROXY_THRESHOLD_PX).toBeGreaterThan(0);
    expect(PROXY_THRESHOLD_PX).toBeLessThanOrEqual(8);
  });
});
