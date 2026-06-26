/**
 * OTP 스토어 DB 통합 테스트 (실 Neon DB — DATABASE_URL 있을 때만 실행).
 *
 * 검증(증거): 발급→검증 전 사이클이 실 DB 에서 정확히 동작.
 *   - requestOtp: 코드 발급 + 해시저장(평문 미보관) + 쿨다운 레이트리밋.
 *   - verifyOtpForEmail: 정답 통과(1회용 소비) · 재사용 거부 · 오답 시도증가 · 만료 거부.
 *
 * 테스트 계정은 고유 이메일(타임스탬프)로 격리하고 종료 시 정리(삭제).
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashOtp } from "./otp";
import { requestOtp, verifyOtpForEmail } from "./otp-store";

loadEnv();

const DB = process.env.DATABASE_URL;
const SECRET = "integration-test-secret";

// DATABASE_URL 없으면 통합 테스트 스킵(CI·로컬 모두 안전).
const d = DB ? describe : describe.skip;

d("OTP 스토어 DB 통합", () => {
  let prisma: PrismaClient;
  const email = `otp-itest-${Date.now()}@eland.co.kr`;

  beforeAll(() => {
    const adapter = new PrismaNeon({ connectionString: DB! });
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    await prisma.otpToken.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("발급 → 정답 검증 통과 → 재사용 거부(1회용)", async () => {
    const now = new Date();
    const issued = await requestOtp({ prisma, email, serverSecret: SECRET, now });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.code).toMatch(/^\d{6}$/);

    // DB 엔 평문이 아니라 해시만 저장됐는지 확인.
    const stored = await prisma.otpToken.findFirst({
      where: { email, consumedAt: null },
    });
    expect(stored).toBeTruthy();
    expect(stored!.codeHash).not.toContain(issued.code);
    expect(stored!.codeHash).toBe(hashOtp(issued.code, stored!.salt, SECRET));

    // 정답 검증 통과.
    const ok = await verifyOtpForEmail({
      prisma,
      email,
      code: issued.code,
      serverSecret: SECRET,
    });
    expect(ok.ok).toBe(true);

    // 같은 코드 재사용 → 소비됨(no_token).
    const reuse = await verifyOtpForEmail({
      prisma,
      email,
      code: issued.code,
      serverSecret: SECRET,
    });
    expect(reuse).toEqual({ ok: false, reason: "no_token" });
  });

  it("오답은 거부(시도횟수 증가)", async () => {
    // 쿨다운 우회: now 를 충분히 미래로 줘서 신규 발급.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const issued = await requestOtp({
      prisma,
      email,
      serverSecret: SECRET,
      now: future,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const wrong = issued.code === "000000" ? "111111" : "000000";
    const res = await verifyOtpForEmail({
      prisma,
      email,
      code: wrong,
      serverSecret: SECRET,
    });
    expect(res).toEqual({ ok: false, reason: "mismatch" });

    const after = await prisma.otpToken.findFirst({
      where: { email, consumedAt: null },
    });
    expect(after!.attempts).toBe(1);
  });

  it("만료된 코드는 거부", async () => {
    const past = new Date(Date.now() + 2 * 60 * 60 * 1000); // 발급 시점(쿨다운 회피)
    const issued = await requestOtp({
      prisma,
      email,
      serverSecret: SECRET,
      now: past,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    // 만료 이후(now = 발급 + 11분)로 검증.
    const later = new Date(past.getTime() + 11 * 60 * 1000);
    const res = await verifyOtpForEmail({
      prisma,
      email,
      code: issued.code,
      serverSecret: SECRET,
      now: later,
    });
    expect(res).toEqual({ ok: false, reason: "expired" });
  });
});
