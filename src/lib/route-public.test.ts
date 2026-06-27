/**
 * 공개 경로 판정 — 과대매칭(startsWith(p)) 제거 회귀(리뷰 #8).
 */

import { describe, expect, it } from "vitest";

import { isPublicPath } from "./route-public";

describe("isPublicPath — 정확일치 + 경계 프리픽스만 공개", () => {
  it("정상 공개 경로는 통과", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/session")).toBe(true);
    expect(isPublicPath("/api/auth/callback/otp")).toBe(true);
    expect(isPublicPath("/api/otp/request")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/health/db")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
  });

  it("접두만 같고 경계 없는 경로는 차단(과대매칭 제거)", () => {
    expect(isPublicPath("/loginxyz")).toBe(false);
    expect(isPublicPath("/api/authxyz")).toBe(false);
    expect(isPublicPath("/api/healthz-internal")).toBe(false);
    expect(isPublicPath("/api/otpsecret")).toBe(false);
  });

  it("보호 라우트는 비공개", () => {
    expect(isPublicPath("/engine")).toBe(false);
    expect(isPublicPath("/api/agg")).toBe(false);
    expect(isPublicPath("/api/upload")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });
});
