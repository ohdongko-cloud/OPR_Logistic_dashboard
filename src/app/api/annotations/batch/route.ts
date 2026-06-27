/**
 * POST /api/annotations/batch — 입력면 배치 업서트(단일 트랜잭션 all-or-nothing).
 *
 * 근거: 백로그 C13 — 단건 N회 POST(Promise.all)의 부분저장 근절. 전부 성공 or 전부 롤백.
 *
 * 인가: input INPUT(물류본부장/admin). 단건 /api/annotations POST 와 동일 게이트·검증 재사용.
 * 본문: { items: AnnotationUpsertInput[] } (zod annotationBatchSchema — 1~100건).
 * 작성자(authorId): 세션에서 서버 주입(클라 전송값 무시 — §4-3).
 * 응답: { ok, count, annotations } — 성공=전체반영. 검증/실패 시 명확한 에러(부분반영 없음).
 */

import { NextResponse } from "next/server";

import { annotationBatchSchema } from "@/lib/annotations";
import { upsertAnnotationsBatch, type UpsertParams } from "@/lib/annotations/repo";
import { guardTab } from "@/lib/authz";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // 입력면 게이트 — input INPUT. 단건 POST 와 동일.
  const guarded = await guardTab("input", "INPUT");
  if (guarded instanceof NextResponse) return guarded;
  const user = guarded;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: false, error: "not_configured", detail: "DB 미구성 — 입력 불가." },
      { status: 503 },
    );
  }
  if (!user.id) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "작성자 식별 불가." },
      { status: 401 },
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

  const parsed = annotationBatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_input",
        detail: parsed.error.issues[0]?.message ?? "입력 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  // 각 항목 → UpsertParams. authorId 는 세션(서버 주입) — 클라 전송값 무시.
  const items: UpsertParams[] = parsed.data.items.map((input) => ({
    kind: input.kind,
    periodType: input.periodType,
    periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
    key: input.key,
    metricCode: "metricCode" in input ? input.metricCode : null,
    numValue: "numValue" in input ? input.numValue : null,
    textValue: "textValue" in input ? input.textValue : null,
    authorId: user.id!,
  }));

  try {
    // 단일 트랜잭션 — 하나라도 실패하면 전부 롤백(부분저장 없음).
    const annotations = await upsertAnnotationsBatch(prisma, items);
    return NextResponse.json(
      { ok: true, count: annotations.length, annotations },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[annotations/batch] POST failed", e);
    return NextResponse.json(
      {
        ok: false,
        error: "save_failed",
        detail: "저장 중 오류가 발생했습니다(반영되지 않았습니다).",
      },
      { status: 500 },
    );
  }
}
