/**
 * 로그인 허용 가드 — 도메인 제한(ALLOWED_EMAIL_DOMAIN) + 정확매칭 예외.
 *
 * 정책(기본): 명시적 allow 가 하나도 구성되지 않으면 "모두 차단"(안전한 기본값).
 *   - ALLOWED_EMAIL_DOMAIN : "eland.co.kr" 또는 "eland.co.kr,partner.com"
 *   - ALLOWED_EMAILS       : "alice@gmail.com,bob@x.com" (정확매칭, 예외 계정)
 *   - MASTER_ADMIN_EMAIL   : 항상 허용(마스터).
 * 비교는 소문자·트림 후. 시크릿 아님(도메인 목록).
 *
 * 근거: 설계문서 §5 권한 · CLAUDE.md 불변규칙(로컬·마스킹·안전한 기본값).
 */
import { env } from "@/lib/env";

function splitCsv(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1);
}

/**
 * 이 이메일이 로그인 허용 대상인가?
 * @param emailRaw 사용자 이메일(대소문자 무관)
 */
export function isEmailAllowed(emailRaw: string | null | undefined): boolean {
  if (!emailRaw) return false;
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@")) return false;

  const master = env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  if (master && email === master) return true;

  const exactAllowed = splitCsv(env.ALLOWED_EMAILS);
  if (exactAllowed.includes(email)) return true;

  const allowedDomains = splitCsv(env.ALLOWED_EMAIL_DOMAIN);
  const domain = emailDomain(email);
  if (domain && allowedDomains.includes(domain)) return true;

  // 안전한 기본값: 명시 허용에 없으면 차단.
  return false;
}

/** 어떤 allow 도 구성되지 않았는지(=락아웃 위험 경고용). */
export function isAllowlistEmpty(): boolean {
  return (
    splitCsv(env.ALLOWED_EMAIL_DOMAIN).length === 0 &&
    splitCsv(env.ALLOWED_EMAILS).length === 0 &&
    !env.MASTER_ADMIN_EMAIL?.trim()
  );
}
