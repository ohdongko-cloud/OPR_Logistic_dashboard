/**
 * GET /api/admin/users — 사용자 목록 + 탭별 권한(ADMIN 전용).
 *
 * 인가: admin MANAGE (requireTab). 비ADMIN 403.
 * 출력: 사용자(id·email·name·role·active·createdAt) + TabPermission[].
 *   실데이터(실적) 미포함 — 계정 메타만.
 *
 * 근거: 작업지시(관리자페이지 — 사용자 목록·권한 부여) · 아키텍처 §5-1.
 */
import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const guarded = await guardTab("admin", "MANAGE");
  if (guarded instanceof NextResponse) return guarded;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: true, dbReady: false, users: [], note: "DB 미구성." },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      perms: { select: { tab: true, level: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    { ok: true, dbReady: true, users },
    { headers: { "cache-control": "no-store" } },
  );
}
