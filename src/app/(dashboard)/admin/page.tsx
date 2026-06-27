import { redirect } from "next/navigation";

import { AdminSystem } from "@/components/admin/admin-system";
import { AdminUsers } from "@/components/admin/admin-users";
import { SnapshotHistory } from "@/components/upload/snapshot-history";
import { requireTab, AuthzError } from "@/lib/authz";

/**
 * 관리자 — RBAC(사용자/권한) + 시스템 상태 + 데이터/스냅샷 관리(ADMIN 전용).
 *
 * 게이트: requireTab("admin","MANAGE"). 비인증 → /login, 권한부족 → /home.
 * 본문(작업지시 ②):
 *   1) 시스템 상태 — DB·인증 구성여부 · 사용자/활성 수 · 마지막 적재(/api/health·users·snapshots 재사용).
 *   2) 사용자·권한 — role·active·탭별 권한(VIEW/INPUT/MANAGE) 부여(기존 RBAC 유지).
 *   3) 데이터/스냅샷 관리 — fileType·기간별 CURRENT/SUPERSEDED 이력·fact수·롤백
 *      (기존 SnapshotHistory 임베드 — /api/snapshots·restore 재사용, 중복 생성 없음).
 *
 * 근거: 작업지시(관리자페이지 완성) · 아키텍처 §4-2 매트릭스 · §5-1.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireTab("admin", "MANAGE");
  } catch (e) {
    if (e instanceof AuthzError && e.status === 403) {
      redirect("/home"); // 인증됐으나 권한 없음 → 홈으로.
    }
    redirect("/login"); // 비인증.
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">관리자</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          사용자·권한(RBAC), 시스템 상태, 데이터·스냅샷을 관리합니다. 변경은 즉시 반영됩니다.
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-8 overflow-auto p-6">
        {/* 1) 시스템 상태 */}
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-zinc-700">시스템 상태</h2>
          <AdminSystem />
        </section>

        {/* 2) 사용자·권한(RBAC) */}
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-zinc-700">사용자 · 권한</h2>
          <AdminUsers />
        </section>

        {/* 3) 데이터 · 스냅샷 관리 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-zinc-700">데이터 · 스냅샷 관리</h2>
            <a
              href="/upload"
              className="text-[11px] text-accent hover:underline"
            >
              업로드 페이지로 →
            </a>
          </div>
          <p className="mb-2 text-[11px] text-zinc-400">
            fileType·기간별 CURRENT/SUPERSEDED 이력과 fact수입니다. SUPERSEDED 행은 복원(롤백)할 수
            있습니다(이력 보존).
          </p>
          <SnapshotHistory />
        </section>
      </div>
    </div>
  );
}
