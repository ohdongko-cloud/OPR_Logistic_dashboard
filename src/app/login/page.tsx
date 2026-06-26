import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

/**
 * 로그인 — 이메일 OTP 인증.
 *
 * 흐름: @eland.co.kr 이메일 입력 → OTP 요청(메일 발송) → 6자리 코드 입력 → 검증·로그인.
 * (dashboard) 그룹 밖 → 사이드바 없는 단독 화면.
 *
 * useSearchParams(callbackUrl·error) → Suspense 경계.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-white">
            O
          </div>
          <h1 className="text-lg font-semibold text-foreground">OPR 물류 대시보드</h1>
          <p className="mt-1 text-sm text-zinc-500">사내 이메일로 로그인하세요.</p>
        </div>
        <Suspense
          fallback={<div className="text-center text-sm text-zinc-400">로딩 중…</div>}
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
