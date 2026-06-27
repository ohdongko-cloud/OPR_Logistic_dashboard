/**
 * 공개(비인증) 경로 판정 — 미들웨어 인증 게이트의 단일 진실원(테스트 가능 순수 로직).
 *
 * 정확일치(=== p) 또는 경계('/') 있는 프리픽스(startsWith(p + "/"))만 공개.
 * ★경계 없는 startsWith(p) 는 쓰지 않는다 — /loginxyz·/api/healthz-internal 처럼
 *   접두만 같은 경로가 인증을 우회하던 과대매칭을 차단(방어심층).
 */

/** 인증 없이 접근 가능한 경로(프리픽스). */
export const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth", // NextAuth 핸들러(signin/callback/session 등)
  "/api/otp", // OTP 발급(로그인 전 접근 필요)
  "/api/health",
  "/_next",
  "/favicon",
] as const;

export function isPublicPath(
  pathname: string,
  prefixes: readonly string[] = PUBLIC_PREFIXES,
): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
