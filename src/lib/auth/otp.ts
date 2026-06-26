/**
 * OTP(6자리 이메일 일회용 코드) 순수 로직 — DB·SMTP 무관.
 *
 * 인증 방식(사용자 확정): @eland.co.kr 이메일 입력 → 해당 메일로 6자리 OTP 발송 →
 *   OTP 입력 시 인증(수신자 인증). 코드는 **해시로만** 저장하고 평문은 보관하지 않는다.
 *
 * 보안:
 *   - 코드 생성 = crypto.randomInt(0~999999) — 예측 불가 엔트로피(Math.random 금지).
 *   - 저장 = sha256(salt + code, key=AUTH_SECRET). 레코드별 salt + 서버 시크릿 결합.
 *   - 검증 = crypto.timingSafeEqual(타이밍 공격 방어).
 *   - 만료(~10분) · 시도횟수 제한 헬퍼.
 *
 * 근거: 작업지시(OTP 6자리·해시저장·만료·시도제한) · 아키텍처 §4-1 인증 흐름.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_CODE_LENGTH = 6;
/** OTP 유효시간 = 10분. */
export const OTP_TTL_MS = 10 * 60 * 1000;
/** 코드당 최대 검증 시도(초과 시 무효). */
export const MAX_OTP_ATTEMPTS = 5;

/** 6자리 숫자 OTP 생성(선행 0 보존, CSPRNG). */
export function generateOtpCode(): string {
  const n = randomInt(0, 1_000_000); // 0 ~ 999999 균등
  return n.toString().padStart(OTP_CODE_LENGTH, "0");
}

/** 입력 코드 정규화 — 공백 제거(사용자가 "123 456" 처럼 칠 수 있음). */
function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/**
 * OTP 해시 = HMAC-SHA256(key=serverSecret, msg=`${salt}:${code}`).
 * 레코드별 salt + 서버 시크릿 결합 → DB 유출만으로 코드 역산 불가.
 */
export function hashOtp(code: string, salt: string, serverSecret: string): string {
  return createHmac("sha256", serverSecret)
    .update(`${salt}:${normalizeCode(code)}`)
    .digest("hex");
}

/** 타이밍 안전 문자열 비교(길이 다르면 즉시 false). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 입력 코드가 저장 해시와 일치하는가(타이밍 안전).
 * 형식(6자리 숫자) 가드 후 해시 비교.
 */
export function verifyOtp(
  inputCode: string,
  storedHash: string,
  salt: string,
  serverSecret: string,
): boolean {
  const code = normalizeCode(inputCode ?? "");
  if (!/^\d{6}$/.test(code)) return false;
  const candidate = hashOtp(code, salt, serverSecret);
  return safeEqualHex(candidate, storedHash);
}

/** 만료 여부(now 기본 = 현재). expiresAt 이 now 이하면 만료. */
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** 시도횟수 한도 초과 여부. */
export function attemptsExceeded(attempts: number): boolean {
  return attempts >= MAX_OTP_ATTEMPTS;
}
