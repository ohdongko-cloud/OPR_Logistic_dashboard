/**
 * Auth.js (NextAuth v5) 골격 설정.
 *
 * ⚠️ provider 는 "자리만" 둔다 — 실제 인증 메일 시스템 미정(설계문서 §7 Q6 영역).
 *    회사 SSO / 이메일 OTP / 매직링크 중 무엇을 쓸지 확정되면 providers 에 추가.
 *    (참조 피킹앱은 Gmail SMTP OTP 자체구현 — 코드 손대지 않음. 이 레포는 Auth.js 기반.)
 *
 * 도메인 제한 가드는 signIn 콜백에 연결됨(isEmailAllowed).
 * DB 어댑터(PrismaAdapter)도 자리만 — DATABASE_URL 구성 시 활성.
 *
 * 근거: 설계문서 §5(입력/출력·권한) · CLAUDE.md 불변규칙.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";

import { isEmailAllowed } from "@/lib/auth/allowlist";
import { env } from "@/lib/env";

/**
 * AUTH_SECRET 해결:
 *   - 운영(production): 반드시 env(AUTH_SECRET) — 없으면 Auth.js 가 정상적으로 실패.
 *   - 개발(골격 구동): env 없으면 dev 전용 임시 시크릿으로 폴백(엔드포인트 500 방지).
 *     이 폴백 값은 시크릿이 아니며(공개 상수) 개발 편의용. 절대 운영에서 쓰지 말 것.
 */
const DEV_FALLBACK_SECRET =
  "dev-only-insecure-secret-not-for-production-replace-with-AUTH_SECRET";
const authSecret =
  env.AUTH_SECRET ??
  (env.NODE_ENV !== "production" ? DEV_FALLBACK_SECRET : undefined);

// ─────────────────────────────────────────────────────────────────────────────
// provider 자리. 예시(미사용 — 메일 시스템 확정 후 주석 해제 + env 구성):
//
//   import EmailProvider from "next-auth/providers/nodemailer";
//   providers: [ EmailProvider({ server: process.env.EMAIL_SERVER, from: ... }) ]
//
// 또는 회사 SSO(OIDC):
//   import { OIDCProvider } from "...";
// ─────────────────────────────────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  secret: authSecret,
  trustHost: true,

  // 메일/프로바이더 미정 → 지금은 빈 배열(로그인 비활성, 가드만 준비).
  providers: [],

  // DB 어댑터 자리: DATABASE_URL 구성되면 PrismaAdapter(getPrisma()) 연결.
  // adapter: ... (다음 단계)

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    /**
     * 로그인 게이트: 허용 이메일(도메인/예외/마스터)만 통과.
     * provider 가 추가되기 전엔 호출되지 않지만, 가드는 미리 박아둔다.
     */
    signIn({ user }) {
      return isEmailAllowed(user?.email);
    },
    /** 보호 페이지 인가(미들웨어/서버에서 활용). 골격: 세션 유무만. */
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
