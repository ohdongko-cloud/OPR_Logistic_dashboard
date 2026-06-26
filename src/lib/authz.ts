/**
 * 서버측 인가 가드 (RBAC) — 클라 신뢰 금지.
 *
 * 근거: 아키텍처 §4-3 "모든 /api/* 핸들러 첫 줄 requireTab" ·
 *        §4-2 권한 = role × tab × level 매트릭스.
 *
 * ⚠️ 현 단계(Neon 미구성): TabPermission 조회는 DB 의존 → role 기반 기본권한까지만
 *    강제한다. DB 구성 후 effectiveLevel 에서 TabPermission 을 합집합(max)으로 병합.
 *    (구조는 미리 박아두되 stub 명시.)
 */

import { auth } from "@/auth";

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

export interface AuthzUser {
  id?: string;
  email?: string | null;
  role?: string;
}

export class AuthzError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * 유효 레벨 = max(role 기본, TabPermission[DB]).
 * 현재는 role 기본만(DB stub). DB 구성 시 user.perms 병합.
 */
export function effectiveLevel(user: AuthzUser, tab: Tab): Level | null {
  return roleBaseLevel(user.role, tab);
}

/**
 * 핸들러 가드. 세션 없으면 401, 권한 부족이면 403 throw.
 * @returns 인증·인가된 사용자
 */
export async function requireTab(tab: Tab, min: Level): Promise<AuthzUser> {
  const session = await auth();
  const user = session?.user as AuthzUser | undefined;
  if (!user) throw new AuthzError(401, "로그인이 필요합니다.");

  const lvl = effectiveLevel(user, tab);
  if (!lvl || LEVEL_RANK[lvl] < LEVEL_RANK[min]) {
    throw new AuthzError(403, `'${tab}' 탭 ${min} 권한이 없습니다.`);
  }
  return user;
}
