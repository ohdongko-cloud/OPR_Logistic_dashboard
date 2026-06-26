/**
 * GET /api/me — 현재 사용자의 유효 권한(탭별 레벨). 클라 UI 게이트용.
 *
 * 보안: 표시(UI) 게이트일 뿐 — 실제 강제는 각 API 의 guardTab 이 서버단에서 한다.
 *   여기서 INPUT 가능 여부를 알려줘도, 위조해도 POST /api/annotations 가 403 으로 막는다.
 *
 * 출력: email·role + caps(tab→level). 비로그인 시 ok:false(401).
 */

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { effectiveLevel, type AuthzUser, type Level, type Tab } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS: Tab[] = ["logistics", "store", "product", "input", "admin"];

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const user = session?.user as AuthzUser | undefined;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const caps: Partial<Record<Tab, Level>> = {};
  for (const tab of TABS) {
    const lvl = await effectiveLevel(user, tab);
    if (lvl) caps[tab] = lvl;
  }

  return NextResponse.json(
    {
      ok: true,
      email: user.email ?? null,
      role: user.role ?? null,
      caps,
      /** input 탭 INPUT 이상 = 입력면 편집 가능. */
      canInput: caps.input === "INPUT" || caps.input === "MANAGE",
      /** input 탭 MANAGE = 데이터 업로드 가능(백데이터 적재). */
      canUpload: caps.input === "MANAGE",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
