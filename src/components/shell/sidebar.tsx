"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";

/**
 * 좌측 사이드바 (레퍼런스 BI 양식 — 짙은 차콜/네이비 배경, 라이트 텍스트).
 *
 * 상단: 앱 로고/타이틀 + 버전 배지 + BI 기준 캡션.
 * 내비: 아이콘+라벨(현재 라우트 = 파란 하이라이트). 스텁 링크는 흐리게.
 * 하단: 사용자 카드(이니셜 아바타 + 이름 + 이메일).
 *
 * 세션 미구성 단계(providers 빈 배열) → user 가 없으면 게스트 표시.
 */
export function Sidebar({
  user,
}: {
  user?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const pathname = usePathname();

  const name = user?.name ?? "OPR 운영자";
  const email = user?.email ?? "logistics@opr.local";
  const initial = (name?.trim()?.[0] ?? "O").toUpperCase();
  const isAdmin = user?.role === "ADMIN";
  // 관리자 전용 메뉴는 ADMIN 에게만 노출(서버 가드와 별개의 UI 숨김).
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="flex w-[208px] shrink-0 flex-col bg-sidebar text-sidebar-fg">
      {/* 로고/타이틀 */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-white">
            O
          </span>
          <span className="text-[15px] font-semibold text-white">OPR 물류</span>
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-fg">
            v1
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-tight text-sidebar-fg-muted">
          BI 기준: 당월/누적 기간
        </p>
      </div>

      <div className="mx-3 border-t border-white/10" />

      {/* 내비 */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
                active
                  ? "bg-sidebar-active font-medium text-white shadow-sm"
                  : item.stub
                    ? "text-sidebar-fg-muted hover:bg-white/5 hover:text-sidebar-fg"
                    : "text-sidebar-fg hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <span className="w-4 text-center text-[13px] opacity-90">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.stub && !active && (
                <span className="ml-auto text-[9px] text-sidebar-fg-muted">준비중</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-white/10" />

      {/* 사용자 카드 */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-white">{name}</p>
          <p className="truncate text-[10px] text-sidebar-fg-muted">{email}</p>
        </div>
      </div>
    </aside>
  );
}
