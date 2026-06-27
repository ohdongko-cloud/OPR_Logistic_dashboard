/**
 * 라우트 게이트 미들웨어 — 비인증 접근을 /login 으로 리다이렉트.
 *
 * 보호 대상: 대시보드 페이지(/engine·/store·/product·/upload·/admin) + 변경성 API.
 * 공개: /login · /api/auth/* (OTP 요청·NextAuth 콜백) · 정적자원.
 *
 * 세밀 권한(tab×level)은 각 API 핸들러의 requireTab/effectiveLevel 이 추가 강제(이중).
 * 미들웨어는 "인증 여부" 1차 게이트.
 *
 * 근거: 작업지시(비인증 → /login) · 아키텍처 §4-3(미들웨어 + 핸들러 재검증).
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfigEdge } from "@/auth.config";
import { isPublicPath } from "@/lib/route-public";

// 엣지 안전 설정으로 미들웨어 전용 auth(provider·DB·crypto 없음).
const { auth } = NextAuth(authConfigEdge);

function isPublic(pathname: string): boolean {
  return isPublicPath(pathname);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const isAuthed = Boolean(req.auth?.user);
  if (isAuthed) return NextResponse.next();

  // 비인증 — API 는 401 JSON, 페이지는 /login 리다이렉트(callbackUrl 보존).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
});

/**
 * matcher: 정적자원·이미지 제외 전 경로. (public 판정은 미들웨어 본문에서.)
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
