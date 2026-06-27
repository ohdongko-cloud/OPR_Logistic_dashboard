/**
 * OTP 검증 레이트리밋 — 이메일+IP 슬라이딩 윈도(리뷰 #9).
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
  checkVerifyRate,
  rateKey,
  resetVerifyRate,
  VERIFY_MAX_PER_WINDOW,
  VERIFY_WINDOW_MS,
} from "./verify-rate-limit";

beforeEach(() => resetVerifyRate());

describe("checkVerifyRate — 슬라이딩 윈도", () => {
  it("윈도 내 한도까지는 허용, 초과부터 거부", () => {
    const key = rateKey("a@eland.co.kr", "1.1.1.1");
    const t0 = 1_000_000;
    for (let i = 0; i < VERIFY_MAX_PER_WINDOW; i++) {
      expect(checkVerifyRate(key, t0 + i).allowed).toBe(true);
    }
    // 한도+1 → 거부.
    expect(checkVerifyRate(key, t0 + VERIFY_MAX_PER_WINDOW).allowed).toBe(false);
    expect(checkVerifyRate(key, t0 + VERIFY_MAX_PER_WINDOW).remaining).toBe(0);
  });

  it("윈도 경과 후 카운트 리셋(만료분 제외)", () => {
    const key = rateKey("a@eland.co.kr", "1.1.1.1");
    const t0 = 2_000_000;
    for (let i = 0; i < VERIFY_MAX_PER_WINDOW; i++) checkVerifyRate(key, t0);
    expect(checkVerifyRate(key, t0).allowed).toBe(false);
    // 윈도를 넘기면 다시 허용.
    expect(checkVerifyRate(key, t0 + VERIFY_WINDOW_MS + 1).allowed).toBe(true);
  });

  it("이메일·IP 분리 — 다른 IP 는 별도 버킷(교차이메일 합산 추측 캡)", () => {
    const e = "a@eland.co.kr";
    const t0 = 3_000_000;
    for (let i = 0; i < VERIFY_MAX_PER_WINDOW; i++) checkVerifyRate(rateKey(e, "1.1.1.1"), t0);
    // 같은 이메일·다른 IP 는 아직 여유.
    expect(checkVerifyRate(rateKey(e, "2.2.2.2"), t0).allowed).toBe(true);
    // 같은 키(IP1)는 막힘.
    expect(checkVerifyRate(rateKey(e, "1.1.1.1"), t0).allowed).toBe(false);
  });

  it("IP 미상이면 'unknown' 키로 이메일 단위 캡 유지", () => {
    const key = rateKey("a@eland.co.kr", null);
    expect(key.endsWith("|unknown")).toBe(true);
    const t0 = 4_000_000;
    for (let i = 0; i < VERIFY_MAX_PER_WINDOW; i++) expect(checkVerifyRate(key, t0).allowed).toBe(true);
    expect(checkVerifyRate(key, t0).allowed).toBe(false);
  });
});
