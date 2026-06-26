/**
 * OTP 레이트리밋 결정 로직 단위 테스트(DB 무관 — 순수 함수).
 */
import { describe, expect, it } from "vitest";

import {
  OTP_RESEND_COOLDOWN_MS,
  OTP_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MS,
  rateLimitDecision,
} from "./otp-store";

const T0 = new Date("2026-06-26T00:00:00Z").getTime();

describe("rateLimitDecision", () => {
  it("최근 발급 이력 없으면 허용", () => {
    const d = rateLimitDecision({ recentTimestamps: [], now: new Date(T0) });
    expect(d.allowed).toBe(true);
  });

  it("쿨다운(직전 발급 후 짧은 시간) 내 재요청은 차단", () => {
    const last = new Date(T0 - 5_000); // 5초 전
    const d = rateLimitDecision({
      recentTimestamps: [last],
      now: new Date(T0),
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("cooldown");
  });

  it("쿨다운 경과 후엔 허용", () => {
    const last = new Date(T0 - OTP_RESEND_COOLDOWN_MS - 1);
    const d = rateLimitDecision({
      recentTimestamps: [last],
      now: new Date(T0),
    });
    expect(d.allowed).toBe(true);
  });

  it("윈도 내 요청수 한도 초과 시 차단", () => {
    // 한도만큼 채우되 쿨다운은 지난 타임스탬프들.
    const ts = Array.from({ length: OTP_REQUESTS_PER_WINDOW }, (_, i) => {
      return new Date(T0 - OTP_RESEND_COOLDOWN_MS - 1000 * (i + 1));
    });
    const d = rateLimitDecision({ recentTimestamps: ts, now: new Date(T0) });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("too_many");
  });

  it("윈도 밖(오래된) 요청은 카운트에서 제외", () => {
    const old = Array.from({ length: OTP_REQUESTS_PER_WINDOW + 2 }, () => {
      return new Date(T0 - OTP_REQUEST_WINDOW_MS - 60_000);
    });
    const d = rateLimitDecision({ recentTimestamps: old, now: new Date(T0) });
    expect(d.allowed).toBe(true);
  });
});
