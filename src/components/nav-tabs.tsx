"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";

/**
 * 전역 탭 네비게이션 (설계문서 §1: ①물류 핵심지표 · ②매장 SCM · ③상품 SCM · 관리자).
 * RBAC(adminOnly) 표시 제어는 다음 단계에서 세션 역할로 게이팅한다(지금은 전부 표시).
 */
export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-zinc-200 px-4">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-800",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
