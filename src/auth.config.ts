/**
 * Auth.js 엣지 안전(edge-safe) 기본 설정 — 미들웨어 전용.
 *
 * 미들웨어는 Edge 런타임에서 돈다 → node:crypto·nodemailer·Prisma(Neon adapter) 등
 * Node 전용 모듈을 import 하면 안 된다. 그래서 Credentials provider(authorize 에서
 * crypto·nodemailer·DB 사용)와 DB 조회 jwt 콜백은 여기 두지 않는다.
 *
 * 여기 설정은:
 *   - 세션 토큰을 "읽기"만(쿠키 복호화) → authorized 로 인증 여부 판정.
 *   - jwt/session 패스스루(토큰의 uid·role 을 세션에 노출, DB 무접근).
 *
 * 실제 로그인(provider·DB)은 src/auth.ts 가 이 설정을 확장해 Node 런타임에서 처리.
 *
 * 근거: 작업지시(미들웨어 게이트) · Auth.js v5 split-config 패턴.
 */
import type { NextAuthConfig } from "next-auth";

import { env } from "@/lib/env";

const DEV_FALLBACK_SECRET =
  "dev-only-insecure-secret-not-for-production-replace-with-AUTH_SECRET";

export const authSecret =
  env.AUTH_SECRET ??
  (env.NODE_ENV !== "production" ? DEV_FALLBACK_SECRET : undefined);

export const authConfigEdge: NextAuthConfig = {
  secret: authSecret,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // 엣지에선 provider 없음(로그인 처리는 Node 런타임의 auth.ts).
  providers: [],
  callbacks: {
    /** 토큰 → 세션 패스스루(DB 무접근). uid·role 은 로그인 시 토큰에 박힘. */
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string | undefined;
        (session.user as { role?: string }).role = token.role as
          | string
          | undefined;
      }
      return session;
    },
    /** 보호 페이지 인가: 세션 유무. */
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
};
