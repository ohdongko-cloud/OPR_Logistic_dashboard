/**
 * PATCH /api/admin/perms — 사용자 권한 변경(ADMIN 전용).
 *
 * 지원 동작(action):
 *   - "role"   : 사용자 role 변경(ADMIN/STAFF/VIEWER). 마스터 계정 강등 차단.
 *   - "active" : 계정 활성/비활성.
 *   - "tab"    : 탭 권한 설정/해제(level=null 이면 해제).
 *
 * 인가: admin MANAGE. 입력 = zod 검증. 작성자(변경자)는 세션에서 서버 주입.
 * 권한 변경은 DB 가 단일 진실원 → 다음 요청부터 즉시 반영(effectiveLevel·jwt 재조회).
 *
 * 근거: 작업지시(role·탭별 권한 부여 UI) · 아키텍처 §4-2 매트릭스 · §7 입력검증.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { guardTab } from "@/lib/authz";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS = ["logistics", "store", "product", "input", "admin"] as const;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("role"),
    userId: z.string().min(1),
    role: z.enum(["ADMIN", "STAFF", "VIEWER"]),
  }),
  z.object({
    action: z.literal("active"),
    userId: z.string().min(1),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("tab"),
    userId: z.string().min(1),
    tab: z.enum(TABS),
    // null = 권한 해제.
    level: z.enum(["VIEW", "INPUT", "MANAGE"]).nullable(),
  }),
]);

export async function PATCH(req: Request): Promise<NextResponse> {
  const guarded = await guardTab("admin", "MANAGE");
  if (guarded instanceof NextResponse) return guarded;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: false, error: "not_configured", detail: "DB 미구성." },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "JSON 본문이 필요합니다." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", detail: "입력 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 대상 사용자 존재 확인.
  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true },
  });
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: "사용자를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const masterEmail = env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  const isMaster = Boolean(masterEmail && target.email.toLowerCase() === masterEmail);

  try {
    if (input.action === "role") {
      // 마스터 계정 강등 차단(항상 ADMIN 보장).
      if (isMaster && input.role !== "ADMIN") {
        return NextResponse.json(
          { ok: false, error: "forbidden", detail: "마스터 관리자는 강등할 수 없습니다." },
          { status: 403 },
        );
      }
      await prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });
    } else if (input.action === "active") {
      if (isMaster && !input.active) {
        return NextResponse.json(
          { ok: false, error: "forbidden", detail: "마스터 관리자는 비활성화할 수 없습니다." },
          { status: 403 },
        );
      }
      await prisma.user.update({
        where: { id: input.userId },
        data: { active: input.active },
      });
    } else {
      // tab 권한 설정/해제.
      if (input.level === null) {
        await prisma.tabPermission.deleteMany({
          where: { userId: input.userId, tab: input.tab },
        });
      } else {
        await prisma.tabPermission.upsert({
          where: { userId_tab: { userId: input.userId, tab: input.tab } },
          update: { level: input.level },
          create: { userId: input.userId, tab: input.tab, level: input.level },
        });
      }
    }
  } catch (e) {
    console.error("[admin/perms] update failed", e);
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: "권한 변경 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, detail: "변경되었습니다." },
    { headers: { "cache-control": "no-store" } },
  );
}
