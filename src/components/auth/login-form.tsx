"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * 이메일 OTP 로그인 폼 (2단계).
 *   1) 이메일 입력 → POST /api/otp/request (메일 발송)
 *      (NextAuth catch-all 충돌 회피 위해 /api/auth/* 가 아닌 /api/otp/* 경로 사용.)
 *   2) 6자리 코드 입력 → signIn("otp", { email, code }) → 세션 발급
 *
 * 코드는 응답에 오지 않는다(메일 또는 dev 콘솔). devHint 만 안내 표시.
 */
type Step = "email" | "code";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/engine";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.detail ?? "인증코드 발송에 실패했습니다.");
        return;
      }
      setStep("code");
      setInfo(
        data?.devHint
          ? `${data.detail} (${data.devHint})`
          : (data?.detail ?? "인증코드를 발송했습니다."),
      );
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null); // 코드 검증 단계 진입 시 dev 안내(info) 배너 닫기 — info+error 동시노출 방지.
    setLoading(true);
    try {
      const res = await signIn("otp", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        redirect: false,
      });
      if (res?.error || !res?.ok) {
        setError("인증코드가 올바르지 않거나 만료되었습니다.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              사내 이메일
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="name@eland.co.kr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "발송 중…" : "인증코드 받기"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-zinc-700">
              인증코드 (6자리)
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              required
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              className="tabnum w-full rounded-md border border-zinc-300 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-zinc-500">{email} 로 발송된 코드를 입력하세요.</p>
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "확인 중…" : "로그인"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setInfo(null);
            }}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-700"
          >
            ← 이메일 다시 입력
          </button>
        </form>
      )}

      {info && (
        <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{info}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
