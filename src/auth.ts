/**
 * Auth.js (NextAuth v5) — 이메일 OTP 인증 + DB 백킹 RBAC.
 *
 * 인증 방식(사용자 확정): @eland.co.kr 이메일 입력 → 6자리 OTP 메일 발송 →
 *   OTP 입력 시 인증(수신자 인증). provider = Credentials(email+code) — authorize 에서
 *   OTP 검증(verifyOtpForEmail) → 통과 시 User upsert(최초=VIEWER, 마스터=ADMIN).
 *
 * 세션 = JWT 전략(Credentials 제약). 단 **권한 즉시반영**을 위해:
 *   - jwt 콜백이 매 요청 DB 에서 role 을 재조회(관리자 강등/승격 즉시 반영).
 *   - tab 별 세부권한(TabPermission)은 requireTab/effectiveLevel 이 매 요청 DB 조회.
 *   → 세션 토큰엔 role 만 캐시, 세밀 권한은 항상 DB 가 단일 진실원.
 *
 * 도메인 가드(@eland.co.kr)는 authorize·signIn 양쪽에서 서버단 강제(isEmailAllowed).
 *
 * 근거: 작업지시(OTP·도메인가드·즉시반영·마스터부트스트랩) · 아키텍처 §4.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfigEdge, authSecret } from "@/auth.config";
import { verifyOtpForEmail } from "@/lib/auth/otp-store";
import { checkVerifyRate, rateKey } from "@/lib/auth/verify-rate-limit";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

/** 이메일 정규화(소문자·트림). */
function normEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 요청 헤더에서 클라이언트 IP 추출(x-forwarded-for 첫 홉 → x-real-ip). */
function clientIp(req: Request | undefined): string | null {
  if (!req) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/** 이 이메일이 마스터 관리자인가(env). */
function isMasterAdmin(email: string): boolean {
  const master = env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(master && email === master);
}

export const authConfig: NextAuthConfig = {
  // 엣지 안전 기본(secret·session·pages·authorized) 확장 + Node 전용 provider/jwt 추가.
  ...authConfigEdge,

  providers: [
    Credentials({
      id: "otp",
      name: "이메일 OTP",
      credentials: {
        email: { label: "이메일", type: "email" },
        code: { label: "인증코드", type: "text" },
      },
      /**
       * OTP 검증 → 통과 시 User upsert. 실패 시 null(=인증 거부).
       * 도메인 가드 + (이메일+IP)레이트리밋 + OTP 검증 + 최초가입/마스터 role 결정.
       */
      async authorize(creds, req) {
        const email = normEmail(String(creds?.email ?? ""));
        const code = String(creds?.code ?? "");
        if (!email || !code) return null;

        // 도메인 가드(서버단 거부).
        if (!isEmailAllowed(email)) return null;

        // 검증 레이트리밋(이메일+IP 슬라이딩 윈도) — 교차이메일 합산 추측·고빈도 콜백 차단.
        const ip = clientIp(req as Request | undefined);
        if (!checkVerifyRate(rateKey(email, ip)).allowed) {
          // 초과 즉시 거부(코드 검증 미수행). 운영 외부노출 시 캡차 추가 권고.
          return null;
        }

        const prisma = getPrisma();
        if (!prisma || !authSecret) return null;

        const result = await verifyOtpForEmail({
          prisma,
          email,
          code,
          serverSecret: authSecret,
        });
        if (!result.ok) return null;

        // 검증 성공 → User upsert. 최초=VIEWER, 마스터=ADMIN(항상 보장).
        const desiredAdmin = isMasterAdmin(email);
        const user = await prisma.user.upsert({
          where: { email },
          update: {
            emailVerified: new Date(),
            // 마스터는 항상 ADMIN 보장(강등 불가). 일반 계정 role 은 건드리지 않음.
            ...(desiredAdmin ? { role: "ADMIN" } : {}),
          },
          create: {
            email,
            role: desiredAdmin ? "ADMIN" : "VIEWER",
            active: true,
            emailVerified: new Date(),
          },
        });

        if (!user.active) return null; // 비활성 계정 차단.

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * 로그인 게이트(이중 방어): 허용 이메일(도메인/예외/마스터)만 통과.
     */
    signIn({ user }) {
      return isEmailAllowed(user?.email);
    },

    /**
     * JWT: 최초 로그인 시 id·role 주입. 이후 매 요청 DB 에서 role 재조회(즉시반영).
     */
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
      }
      // 권한 즉시반영: 토큰의 uid 로 DB role 재조회(강등/승격/비활성 반영).
      if (token.uid) {
        const prisma = getPrisma();
        if (prisma) {
          try {
            const u = await prisma.user.findUnique({
              where: { id: token.uid as string },
              select: { role: true, active: true },
            });
            if (!u || !u.active) {
              // 삭제·비활성 → 토큰 무력화(role 제거).
              token.role = undefined;
              token.uid = undefined;
            } else {
              token.role = u.role;
            }
          } catch {
            // DB 일시 오류 → 기존 토큰 role 유지(가용성).
          }
        }
      }
      return token;
    },

    /** 세션에 id·role 노출(클라/서버 가드용). */
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string | undefined;
        (session.user as { role?: string }).role = token.role as
          | string
          | undefined;
      }
      return session;
    },

    /** 보호 페이지 인가(미들웨어): 세션 유무. */
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
