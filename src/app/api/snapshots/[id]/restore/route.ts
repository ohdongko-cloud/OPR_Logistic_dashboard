/**
 * POST /api/snapshots/[id]/restore — 업로드 롤백(SUPERSEDED → CURRENT 복원).
 *
 * 근거: 백로그 C11 · 아키텍처 §5-1(업로드 계열 = input MANAGE) · persist*.ts PUBLISH 역방향.
 *
 * 인가: input MANAGE(업로드/적재 권한자만 — 강등/승격은 백데이터 상태 변경).
 * 동작: restoreSnapshot(단일 트랜잭션) — 같은 (fileType, periodType) 현 CURRENT 강등 →
 *       대상 승격. 부분 유니크 인덱스 위반 없이(강등→승격 순). IngestLog 에 RESTORE 기록.
 * 검증: 대상이 SUPERSEDED 가 아니면 409, 없으면 404, 권한없음 401/403.
 * 복원 후: 라이브파일 인메모리 캐시 무효화(CURRENT 가 바뀌었으므로 stale 방지).
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";
import { clearEngineCache } from "@/lib/server/engine-cache";
import { clearProductCache } from "@/lib/server/product-source";
import { restoreSnapshot, RestoreError } from "@/lib/server/restore";
import { clearStoreCache } from "@/lib/server/store-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 업로드 게이트와 동일 — input MANAGE. 클라 신뢰 금지(서버 강제).
  const guarded = await guardTab("input", "MANAGE");
  if (guarded instanceof NextResponse) return guarded;
  const user = guarded;

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "스냅샷 id 가 필요합니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: false, error: "not_configured", detail: "DB 미구성 — 복원 불가." },
      { status: 503 },
    );
  }

  try {
    const res = await restoreSnapshot(prisma, id, user.id);

    // CURRENT 가 바뀌었으므로 폴백 캐시 무효화(아이템 복원 = 엔진+상품, 매장 복원 = 매장).
    if (res.fileType === "ITEM" || res.fileType === "PRODUCT") {
      clearEngineCache();
      clearProductCache();
    }
    if (res.fileType === "STORE") {
      clearStoreCache();
    }

    return NextResponse.json(
      {
        ok: true,
        restoredId: res.restoredId,
        demotedIds: res.demotedIds,
        fileType: res.fileType,
        periodType: res.periodType,
        detail:
          res.demotedIds.length > 0
            ? "복원되었습니다 — 이전 CURRENT 는 SUPERSEDED 로 강등되었습니다(이력 보존)."
            : "복원되었습니다 — CURRENT 로 승격되었습니다.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof RestoreError) {
      return NextResponse.json(
        { ok: false, error: e.status === 404 ? "not_found" : "conflict", detail: e.message },
        { status: e.status },
      );
    }
    // 상세 누출 금지 — 안전 메시지.
    console.error("[snapshots/restore] failed", e);
    return NextResponse.json(
      { ok: false, error: "restore_failed", detail: "복원 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
