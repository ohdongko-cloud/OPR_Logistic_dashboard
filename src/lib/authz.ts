/**
 * 서버측 인가 가드 (RBAC) — 클라 신뢰 금지.
 *
 * 근거: 아키텍처 §4-3 "모든 /api/* 핸들러 첫 줄 requireTab" ·
 *        §4-2 권한 = role × tab × level 매트릭스.
 *
 * 유효권한 = max(role 기본권한, TabPermission[DB]). ADMIN = 전 tab MANAGE 암묵.
 *   - role 기본: 인증자=전 출력탭 VIEW(전원 조회). 입력/관리는 TabPermission 명시 부여.
 *   - DB TabPermission: 관리자페이지에서 user×tab×level 부여 → 즉시 병합(DB 세션).
 */

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";

export type Tab = "logistics" | "store" | "product" | "input" | "admin";
export type Level = "VIEW" | "INPUT" | "MANAGE";

const LEVEL_RANK: Record<Level, number> = { VIEW: 1, INPUT: 2, MANAGE: 3 };

/** role 기반 기본권한 (아키텍처 §4-2 매트릭스). DB TabPermission 병합 전 베이스. */
function roleBaseLevel(role: string | undefined, tab: Tab): Level | null {
  if (role === "ADMIN") return "MANAGE"; // 전 tab MANAGE 암묵
  // STAFF/VIEWER 기본 = 전 출력탭 VIEW. 입력/관리는 TabPermission 명시 부여(DB).
  if (tab === "logistics" || tab === "store" || tab === "product") return "VIEW";
  return null; // input/admin 은 명시 부여 필요
}

/** 두 레벨 중 높은 쪽(null 안전). */
function maxLevel(a: Level | null, b: Level | null): Level | null {
  if (!a) return b;
  if (!b) return a;
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export interface AuthzUser {
  id?: string;
  email?: string | null;
  role?: string;
}

export class AuthzError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * 유효 레벨 = max(role 기본, TabPermission[DB]).
 * DB 미구성/조회불가 시 role 기본만(graceful). ADMIN 은 DB 무관 전 tab MANAGE.
 */
export async function effectiveLevel(
  user: AuthzUser,
  tab: Tab,
): Promise<Level | null> {
  const base = roleBaseLevel(user.role, tab);
  if (user.role === "ADMIN") return base; // 이미 MANAGE — DB 조회 불필요

  const prisma = getPrisma();
  if (!prisma || !user.id) return base;

  try {
    const perm = await prisma.tabPermission.findUnique({
      where: { userId_tab: { userId: user.id, tab } },
      select: { level: true },
    });
    return maxLevel(base, (perm?.level as Level | undefined) ?? null);
  } catch {
    // DB 일시 오류 → 안전하게 role 기본만(권한 상승 금지).
    return base;
  }
}

/**
 * 핸들러 가드. 세션 없으면 401, 권한 부족이면 403 throw.
 * @returns 인증·인가된 사용자
 */
export async function requireTab(tab: Tab, min: Level): Promise<AuthzUser> {
  const session = await auth();
  const user = session?.user as AuthzUser | undefined;
  if (!user) throw new AuthzError(401, "로그인이 필요합니다.");

  const lvl = await effectiveLevel(user, tab);
  if (!lvl || LEVEL_RANK[lvl] < LEVEL_RANK[min]) {
    throw new AuthzError(403, `'${tab}' 탭 ${min} 권한이 없습니다.`);
  }
  return user;
}

/**
 * API 핸들러용 게이트 — 통과 시 user, 실패 시 NextResponse(401/403) 반환.
 * 호출부: `const g = await guardTab(...); if (g instanceof NextResponse) return g;`
 */
export async function guardTab(
  tab: Tab,
  min: Level,
): Promise<AuthzUser | NextResponse> {
  try {
    return await requireTab(tab, min);
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.status === 401 ? "unauthorized" : "forbidden",
          detail: e.message,
        },
        { status: e.status },
      );
    }
    // 인증 시스템 오류 등 → 안전하게 401(상세 누출 금지).
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "인증을 확인할 수 없습니다." },
      { status: 401 },
    );
  }
}
