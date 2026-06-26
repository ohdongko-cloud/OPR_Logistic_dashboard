/**
 * OTP DB 스토어 — 발급(레이트리밋·해시저장)·검증(만료·시도제한·1회용 소비).
 *
 * 평문 코드는 DB 에 저장하지 않는다(codeHash 만). 발급 시 평문은 호출부(메일러)에만
 * 잠시 전달되고 폐기. 레이트리밋(쿨다운 + 윈도당 횟수)으로 무차별·스팸 방어.
 *
 * 근거: 작업지시(해시저장·~10분 만료·시도제한·레이트리밋) · 아키텍처 §4-1·§7 입력검증.
 */
import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  MAX_OTP_ATTEMPTS,
  OTP_TTL_MS,
  attemptsExceeded,
  generateOtpCode,
  hashOtp,
  isExpired,
  verifyOtp,
} from "@/lib/auth/otp";

/** 재발송 최소 간격(쿨다운). */
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30초
/** 레이트리밋 윈도. */
export const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1시간
/** 윈도당 최대 발급 횟수. */
export const OTP_REQUESTS_PER_WINDOW = 5;

export type RateLimitReason = "cooldown" | "too_many";

export interface RateLimitResult {
  allowed: boolean;
  reason?: RateLimitReason;
}

/**
 * 발급 이력(타임스탬프 목록)으로 레이트리밋 판정 — 순수 함수(테스트 용이).
 *  - 직전 발급으로부터 쿨다운 미경과 → cooldown
 *  - 윈도 내 발급수 ≥ 한도 → too_many
 */
export function rateLimitDecision(args: {
  recentTimestamps: Date[];
  now?: Date;
}): RateLimitResult {
  const now = (args.now ?? new Date()).getTime();
  const inWindow = args.recentTimestamps
    .map((d) => d.getTime())
    .filter((t) => now - t < OTP_REQUEST_WINDOW_MS);

  const last = inWindow.length ? Math.max(...inWindow) : null;
  if (last !== null && now - last < OTP_RESEND_COOLDOWN_MS) {
    return { allowed: false, reason: "cooldown" };
  }
  if (inWindow.length >= OTP_REQUESTS_PER_WINDOW) {
    return { allowed: false, reason: "too_many" };
  }
  return { allowed: true };
}

export type RequestOtpResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: RateLimitReason };

/**
 * OTP 발급 — 레이트리밋 통과 시 코드 생성·해시저장, 평문 코드 반환(메일 발송용).
 * 같은 이메일의 기존 미소비 토큰은 무효화(consumedAt 마킹)하고 신규 1건만 유효.
 */
export async function requestOtp(args: {
  prisma: PrismaClient;
  email: string;
  serverSecret: string;
  now?: Date;
}): Promise<RequestOtpResult> {
  const { prisma, email, serverSecret } = args;
  const now = args.now ?? new Date();

  // 최근 발급 이력(윈도) 조회 → 레이트리밋.
  const since = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);
  const recent = await prisma.otpToken.findMany({
    where: { email, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const decision = rateLimitDecision({
    recentTimestamps: recent.map((r) => r.createdAt),
    now,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason! };
  }

  // 기존 미소비 토큰 무효화(신규만 유효 — 직전 코드로는 더 못 들어오게).
  await prisma.otpToken.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateOtpCode();
  const salt = randomBytes(16).toString("hex");
  const codeHash = hashOtp(code, salt, serverSecret);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.otpToken.create({
    data: { email, codeHash, salt, expiresAt, attempts: 0, createdAt: now },
  });

  return { ok: true, code, expiresAt };
}

export type VerifyReason =
  | "no_token"
  | "expired"
  | "too_many_attempts"
  | "mismatch";

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: VerifyReason };

/**
 * OTP 검증 — 이메일의 최신 미소비 토큰 1건 대상.
 *  - 토큰 없음/이미 소비 → no_token
 *  - 만료 → expired (소비 처리)
 *  - 시도 한도 초과 → too_many_attempts (소비 처리)
 *  - 불일치 → attempts++ 후 mismatch
 *  - 일치 → consumedAt 마킹(1회용), ok
 */
export async function verifyOtpForEmail(args: {
  prisma: PrismaClient;
  email: string;
  code: string;
  serverSecret: string;
  now?: Date;
}): Promise<VerifyOtpResult> {
  const { prisma, email, code, serverSecret } = args;
  const now = args.now ?? new Date();

  const token = await prisma.otpToken.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!token) return { ok: false, reason: "no_token" };

  if (isExpired(token.expiresAt, now)) {
    await prisma.otpToken.update({
      where: { id: token.id },
      data: { consumedAt: now },
    });
    return { ok: false, reason: "expired" };
  }

  if (attemptsExceeded(token.attempts)) {
    await prisma.otpToken.update({
      where: { id: token.id },
      data: { consumedAt: now },
    });
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = verifyOtp(code, token.codeHash, token.salt, serverSecret);
  if (!matches) {
    const attempts = token.attempts + 1;
    await prisma.otpToken.update({
      where: { id: token.id },
      // 한도 도달 시 즉시 소비(더는 시도 불가).
      data: {
        attempts,
        consumedAt: attempts >= MAX_OTP_ATTEMPTS ? now : null,
      },
    });
    return { ok: false, reason: "mismatch" };
  }

  // 성공 → 1회용 소비.
  await prisma.otpToken.update({
    where: { id: token.id },
    data: { consumedAt: now },
  });
  return { ok: true };
}
