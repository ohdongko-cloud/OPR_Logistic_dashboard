/**
 * OTP 순수 로직 단위 테스트 (DB·SMTP 무관).
 *
 * 검증 대상:
 *   - generateOtpCode: 6자리 숫자, 매번 다름(엔트로피), 선행 0 보존.
 *   - hashOtp: 결정적 해시(같은 입력=같은 출력), 평문 미노출, 솔트 결합.
 *   - verifyOtp: 정답만 통과(타이밍 안전 비교), 공백·대문자 정규화.
 *   - 만료·시도횟수 헬퍼: isExpired / attemptsExceeded.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_OTP_ATTEMPTS,
  OTP_CODE_LENGTH,
  OTP_TTL_MS,
  attemptsExceeded,
  generateOtpCode,
  hashOtp,
  isExpired,
  verifyOtp,
} from "./otp";

const SECRET = "test-secret-for-otp-hash";

describe("generateOtpCode", () => {
  it("정확히 6자리 숫자 문자열", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toHaveLength(OTP_CODE_LENGTH);
    }
  });

  it("선행 0 을 보존한다(000000~999999 전 구간 가능)", () => {
    // 충분한 표본에서 최소 1개는 0으로 시작할 확률이 매우 높음.
    const codes = Array.from({ length: 5000 }, () => generateOtpCode());
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });

  it("연속 생성이 대부분 서로 다르다(엔트로피)", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtpCode()));
    // 100개 중 90개 이상 유니크(충돌은 드물어야).
    expect(codes.size).toBeGreaterThanOrEqual(90);
  });
});

describe("hashOtp", () => {
  it("결정적: 같은 (코드, 솔트, 시크릿) → 같은 해시", () => {
    const h1 = hashOtp("123456", "salt-a", SECRET);
    const h2 = hashOtp("123456", "salt-a", SECRET);
    expect(h1).toBe(h2);
  });

  it("평문 코드를 해시에 노출하지 않는다", () => {
    const h = hashOtp("123456", "salt-a", SECRET);
    expect(h).not.toContain("123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("솔트가 다르면 해시가 다르다", () => {
    expect(hashOtp("123456", "salt-a", SECRET)).not.toBe(
      hashOtp("123456", "salt-b", SECRET),
    );
  });

  it("시크릿이 다르면 해시가 다르다(키 결합)", () => {
    expect(hashOtp("123456", "salt-a", "secret-1")).not.toBe(
      hashOtp("123456", "salt-a", "secret-2"),
    );
  });
});

describe("verifyOtp", () => {
  const salt = "salt-xyz";
  const stored = hashOtp("123456", salt, SECRET);

  it("정답 코드는 통과", () => {
    expect(verifyOtp("123456", stored, salt, SECRET)).toBe(true);
  });

  it("오답 코드는 거부", () => {
    expect(verifyOtp("000000", stored, salt, SECRET)).toBe(false);
    expect(verifyOtp("123457", stored, salt, SECRET)).toBe(false);
  });

  it("입력 공백을 정규화한다", () => {
    expect(verifyOtp("  123456  ", stored, salt, SECRET)).toBe(true);
    expect(verifyOtp("123 456", stored, salt, SECRET)).toBe(true);
  });

  it("길이/형식이 틀리면 거부(해시 비교 전 가드)", () => {
    expect(verifyOtp("abc", stored, salt, SECRET)).toBe(false);
    expect(verifyOtp("", stored, salt, SECRET)).toBe(false);
  });
});

describe("만료·시도 헬퍼", () => {
  it("isExpired: 만료시각 이전이면 false, 이후면 true", () => {
    const now = new Date("2026-06-26T00:00:00Z");
    const future = new Date(now.getTime() + 60_000);
    const past = new Date(now.getTime() - 1);
    expect(isExpired(future, now)).toBe(false);
    expect(isExpired(past, now)).toBe(true);
  });

  it("OTP_TTL_MS 는 약 10분", () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("attemptsExceeded: 한도 초과 판정", () => {
    expect(attemptsExceeded(MAX_OTP_ATTEMPTS - 1)).toBe(false);
    expect(attemptsExceeded(MAX_OTP_ATTEMPTS)).toBe(true);
    expect(attemptsExceeded(MAX_OTP_ATTEMPTS + 1)).toBe(true);
  });
});
