/**
 * POST /api/otp/request — 이메일 OTP 발급·발송.
 *   (※ /api/auth/* 는 NextAuth catch-all 이 점유 → OTP 발급은 /api/otp 로 분리.)
 *
 * 흐름: { email } 수신 → 도메인 가드(@eland.co.kr 외 거부) → 레이트리밋 →
 *   6자리 OTP 생성·해시저장(DB, ~10분) → SMTP 발송(or dev 콘솔 로그).
 *
 * 보안:
 *   - 코드·해시는 절대 응답에 포함하지 않는다(dev 로그만 코드 노출, production 차단).
 *   - 비-eland 이메일은 서버단 422 거부(도메인 가드).
 *   - 레이트리밋(쿨다운·윈도) 초과 시 429.
 *   - 계정 존재 여부를 응답으로 흘리지 않음(열거 방지) — 도메인 통과면 동일 응답.
 *
 * 근거: 작업지시(OTP request·도메인가드·해시저장·레이트리밋·dev폴백) · 아키텍처 §4-1.
 */
import { NextResponse } from "next/server";

import { isEmailAllowed } from "@/lib/auth/allowlist";
import { sendOtpEmail } from "@/lib/auth/mailer";
import { requestOtp } from "@/lib/auth/otp-store";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs"; // nodemailer·crypto = Node 런타임
export const dynamic = "force-dynamic";

function normEmail(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1) 본문 파싱.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "JSON 본문이 필요합니다." },
      { status: 400 },
    );
  }
  const email = normEmail((body as { email?: unknown })?.email);

  // 2) 형식·도메인 가드(서버단 거부).
  if (!email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "invalid_email", detail: "이메일 형식이 아닙니다." },
      { status: 400 },
    );
  }
  if (!isEmailAllowed(email)) {
    const domain = env.ALLOWED_EMAIL_DOMAIN || "사내";
    return NextResponse.json(
      {
        ok: false,
        error: "domain_not_allowed",
        detail: `허용된 도메인(${domain}) 이메일만 사용할 수 있습니다.`,
      },
      { status: 422 },
    );
  }

  // 3) AUTH_SECRET·DB 가드.
  const secret = env.AUTH_SECRET ?? undefined;
  const prisma = getPrisma();
  if (!prisma || !secret) {
    // 시크릿/DB 미구성 = 발급 불가(서버 구성 문제 — 코드 노출 없이 안전 메시지).
    console.error("[otp/request] 구성 누락: prisma 또는 AUTH_SECRET");
    return NextResponse.json(
      {
        ok: false,
        error: "not_configured",
        detail: "인증 시스템이 아직 구성되지 않았습니다. 관리자에게 문의하세요.",
      },
      { status: 503 },
    );
  }

  // 4) 발급(레이트리밋).
  let issued;
  try {
    issued = await requestOtp({ prisma, email, serverSecret: secret });
  } catch (e) {
    console.error("[otp/request] 발급 실패", e);
    return NextResponse.json(
      { ok: false, error: "issue_failed", detail: "인증코드 발급 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
  if (!issued.ok) {
    const detail =
      issued.reason === "cooldown"
        ? "잠시 후 다시 시도하세요(재발송 대기)."
        : "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
    return NextResponse.json(
      { ok: false, error: "rate_limited", reason: issued.reason, detail },
      { status: 429 },
    );
  }

  // 5) 발송(SMTP or dev 로그). 코드는 응답에 절대 미포함.
  let sent;
  try {
    sent = await sendOtpEmail({ to: email, code: issued.code });
  } catch (e) {
    console.error("[otp/request] 발송 실패", e);
    return NextResponse.json(
      {
        ok: false,
        error: "send_failed",
        detail: "인증코드 발송에 실패했습니다. 관리자에게 문의하세요.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      detail: "인증코드를 이메일로 발송했습니다. 메일함을 확인하세요.",
      // 진단용(코드 아님) — dev 모드면 콘솔 로그 안내. production 응답엔 노출 안 됨.
      ...(sent.devLogged ? { devHint: "개발 모드: 서버 콘솔 로그에서 코드를 확인하세요." } : {}),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
