/**
 * 환경변수 접근 헬퍼 (골격).
 *
 * 시크릿 하드코딩 금지(헌장 §불변규칙). 실제 값은 .env.local / Vercel envvar.
 * 이 파일은 "있으면 쓰고, 없으면 안전한 기본/undefined" 로만 동작한다.
 * 엄격한 런타임 검증(zod parse)은 비즈니스 로직 단계에서 강화한다.
 */

export const env = {
  // Neon Postgres
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,

  // Auth.js
  AUTH_SECRET: process.env.AUTH_SECRET,

  // 로그인 도메인 제한 (예: "eland.co.kr"). 콤마로 여러 도메인 허용.
  ALLOWED_EMAIL_DOMAIN: process.env.ALLOWED_EMAIL_DOMAIN,

  // 추가 허용 이메일(정확매칭, 콤마구분) — 도메인 밖 예외 계정용. 선택.
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,

  // 마스터 관리자 1명(RBAC). 하드코딩 금지 — 반드시 env.
  MASTER_ADMIN_EMAIL: process.env.MASTER_ADMIN_EMAIL,

  // ── OTP 메일 발송(Google SMTP) ──────────────────────────────────────────
  // SMTP_USER+SMTP_PASS(Gmail 계정·앱비밀번호) 또는 EMAIL_SERVER(URL) 중 하나.
  // 미설정 시: 개발=콘솔 로그 폴백 / production=발송 불가(코드 노출 금지).
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_SERVER: process.env.EMAIL_SERVER,
  EMAIL_FROM: process.env.EMAIL_FROM,

  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;

/** DB(Neon) 연결이 구성되어 있는지. 미구성 시 DB 의존 기능은 비활성/스텁. */
export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

/** Auth.js 비밀키가 구성되어 있는지. */
export function isAuthConfigured(): boolean {
  return Boolean(env.AUTH_SECRET);
}
