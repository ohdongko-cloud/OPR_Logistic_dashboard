import Link from "next/link";
import { Suspense } from "react";

import { NavTabs } from "@/components/nav-tabs";
import { PeriodToggle } from "@/components/period-toggle";

/**
 * 대시보드 공통 레이아웃 (설계문서 §1 화면 맵).
 * 전역 헤더(제목 + 기간토글) + 탭(3뷰 + 관리자) + 본문 슬롯.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3">
        <Link href="/engine" className="text-lg font-semibold text-zinc-900">
          OPR 물류 실적 대시보드
        </Link>
        <div className="flex items-center gap-3">
          <Suspense fallback={<div className="h-8 w-28 rounded-md border border-zinc-200" />}>
            <PeriodToggle />
          </Suspense>
          {/* TODO(다음 단계): 필터(▾) · 사용자/로그아웃(세션) */}
        </div>
      </header>

      <NavTabs />

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
