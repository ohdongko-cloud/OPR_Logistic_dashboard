import { redirect } from "next/navigation";

import { AdminUsers } from "@/components/admin/admin-users";
import { requireTab, AuthzError } from "@/lib/authz";

/**
 * 관리자 — 사용자/권한(RBAC) 관리(ADMIN 전용).
 *
 * 게이트: requireTab("admin","MANAGE"). 비인증 → /login, 권한부족 → /engine.
 * 본문: 사용자 목록 + role·active·탭별 권한(VIEW/INPUT/MANAGE) 부여 UI(클라).
 *
 * 근거: 작업지시(관리자페이지) · 아키텍처 §4-2 매트릭스 · §5-1.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireTab("admin", "MANAGE");
  } catch (e) {
    if (e instanceof AuthzError && e.status === 403) {
      redirect("/engine"); // 인증됐으나 권한 없음 → 메인으로.
    }
    redirect("/login"); // 비인증.
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">관리자 — 사용자·권한</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          사용자 역할(role)과 탭별 권한(VIEW/INPUT/MANAGE)을 부여합니다. 변경은 즉시 반영됩니다.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <AdminUsers />
      </div>
    </div>
  );
}
