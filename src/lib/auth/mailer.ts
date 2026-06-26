/**
 * OTP 메일러 — Google SMTP(nodemailer) 발송 + dev 콘솔 폴백.
 *
 * 발송 경로(resolveMailTransport):
 *   - "smtp"        : SMTP_USER+SMTP_PASS 또는 EMAIL_SERVER 구성됨 → 실제 발송.
 *   - "dev-log"     : 개발환경 + SMTP 미설정 → OTP 를 **서버 콘솔 로그**로 출력(테스트용).
 *   - "unconfigured": production + SMTP 미설정 → 코드 로그 노출 금지(NODE_ENV 가드).
 *
 * ⚠️ production 에서는 절대 코드를 로그로 찍지 않는다(unconfigured → 발송 실패 처리).
 *
 * 근거: 작업지시(Google SMTP·nodemailer·dev 폴백·NODE_ENV 가드) · 아키텍처 §7 시크릿 env.
 */
import nodemailer from "nodemailer";

import { OTP_TTL_MS } from "@/lib/auth/otp";

export type MailTransportMode = "smtp" | "dev-log" | "unconfigured";

export interface MailEnv {
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** 단일 URL 형식(예: smtp://user:pass@smtp.gmail.com:587). */
  EMAIL_SERVER?: string;
  EMAIL_FROM?: string;
  NODE_ENV?: string;
}

const DEFAULT_FROM = "OPR 물류 대시보드 <no-reply@opr.local>";
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;

/** 발송 경로 결정(시크릿 값은 다루지 않고 존재 여부만). */
export function resolveMailTransport(env: MailEnv): MailTransportMode {
  const hasUserPass = Boolean(env.SMTP_USER && env.SMTP_PASS);
  const hasServerUrl = Boolean(env.EMAIL_SERVER);
  if (hasUserPass || hasServerUrl) return "smtp";
  // SMTP 미설정.
  return env.NODE_ENV === "production" ? "unconfigured" : "dev-log";
}

export interface OtpMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** OTP 메일 본문 렌더(발송 모드 무관 — 순수). */
export function buildOtpMessage(args: {
  to: string;
  code: string;
  ttlMinutes: number;
  from?: string;
}): OtpMessage {
  const { to, code, ttlMinutes } = args;
  const from = args.from?.trim() || DEFAULT_FROM;
  const subject = `[OPR 물류 대시보드] 로그인 인증코드: ${code}`;
  const text = [
    "OPR 물류 대시보드 로그인 인증코드입니다.",
    "",
    `인증코드: ${code}`,
    `유효시간: ${ttlMinutes}분`,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시하세요.",
  ].join("\n");
  const html = [
    '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">',
    "<h2>OPR 물류 대시보드</h2>",
    "<p>로그인 인증코드입니다.</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
    `<p style="color:#666">유효시간 ${ttlMinutes}분. 본인이 요청하지 않았다면 무시하세요.</p>`,
    "</div>",
  ].join("");
  return { to, from, subject, text, html };
}

/** nodemailer transporter(SMTP 모드 전용). */
function createTransporter(env: MailEnv) {
  if (env.EMAIL_SERVER) {
    return nodemailer.createTransport(env.EMAIL_SERVER);
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export interface SendOtpResult {
  mode: MailTransportMode;
  delivered: boolean;
  /** dev-log 모드에서만 true(테스트 응답 힌트용 — 코드 자체는 응답에 절대 미포함). */
  devLogged?: boolean;
}

/**
 * OTP 발송. 모드별:
 *   - smtp        : 실제 발송.
 *   - dev-log     : 서버 콘솔에만 코드 출력(브라우저/응답엔 절대 노출 금지).
 *   - unconfigured: 발송 불가(throw) — production 코드 로그 노출 차단.
 */
export async function sendOtpEmail(args: {
  to: string;
  code: string;
  env?: MailEnv;
}): Promise<SendOtpResult> {
  const env: MailEnv = args.env ?? {
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_SERVER: process.env.EMAIL_SERVER,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NODE_ENV: process.env.NODE_ENV,
  };
  const ttlMinutes = Math.round(OTP_TTL_MS / 60000);
  const mode = resolveMailTransport(env);

  if (mode === "unconfigured") {
    // production + SMTP 미설정 → 코드 로그 금지. 호출부에서 500 처리.
    throw new Error(
      "메일 발송 시스템이 구성되지 않았습니다(SMTP env 누락). 관리자에게 문의하세요.",
    );
  }

  if (mode === "dev-log") {
    // 개발 전용 — 서버 콘솔에만 출력. 절대 응답에 담지 않는다.
    console.warn(
      `\n[DEV OTP] ${args.to} → 인증코드 ${args.code} (유효 ${ttlMinutes}분)\n` +
        "  ※ SMTP env 미설정 폴백. production 에서는 노출되지 않습니다.\n",
    );
    return { mode, delivered: true, devLogged: true };
  }

  // smtp
  const transporter = createTransporter(env);
  const message = buildOtpMessage({
    to: args.to,
    code: args.code,
    ttlMinutes,
    from: env.EMAIL_FROM,
  });
  await transporter.sendMail(message);
  return { mode, delivered: true };
}
