/**
 * /api/annotations — 입력면(목표·전년·비고·조치) 조회·입력·삭제.
 *
 * GET  : 인가 logistics VIEW. 기간의 주석 목록 + 전년 자동값(이력 조인) 반환.
 *        → 화면(KPI·트리)이 오버레이로 병합(출력면 불변, 옵셔널 레이어).
 * POST : 인가 input INPUT. zod 검증 후 grain 멱등 upsert. 작성자=세션 서버주입.
 * DELETE: 인가 input INPUT. id 로 주석 삭제(입력 취소).
 *
 * 근거: 아키텍처 §5-1 (/api/annotations GET=VIEW · POST=input INPUT) ·
 *        §4-3 (작성자 서버주입·클라 신뢰 금지) · Slide5(목표/전년/비고).
 */

import { NextResponse } from "next/server";

import {
  annotationDeleteSchema,
  annotationUpsertSchema,
  type AnnotationDto,
  type TargetMetric,
} from "@/lib/annotations";
import {
  computeAutoPriorYear,
  deleteAnnotation,
  listAnnotations,
  upsertAnnotation,
} from "@/lib/annotations/repo";
import { guardTab } from "@/lib/authz";
import { parsePeriod, type PeriodType } from "@/lib/engine";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET 응답 계약(옵셔널 — 화면 오버레이용). */
export interface AnnotationsResponse {
  ok: true;
  periodType: PeriodType;
  dbReady: boolean;
  annotations: AnnotationDto[];
  /** 노드키문자열 → 지표코드 → 전년 자동값(이력 조인). 없으면 빈 객체. */
  autoPriorYear: Record<string, Partial<Record<TargetMetric, number>>>;
}

/**
 * 대상 기간(periodStart/End) 추론 — CURRENT 스냅샷 우선, 없으면 당월 1일.
 * Annotation 은 스냅샷과 분리된 기간 grain → 입력 시 일관된 periodStart 필요.
 */
async function resolvePeriodDates(
  prisma: ReturnType<typeof getPrisma>,
  periodType: PeriodType,
): Promise<{ periodStart: Date; periodEnd: Date }> {
  if (prisma) {
    const snap = await prisma.snapshot
      .findFirst({
        where: { periodType, status: "CURRENT" },
        orderBy: { periodEnd: "desc" },
        select: { periodStart: true, periodEnd: true },
      })
      .catch(() => null);
    if (snap) return { periodStart: snap.periodStart, periodEnd: snap.periodEnd };
  }
  // 폴백: 당월 1일~말일(이력 없을 때 합리적 기본).
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  return { periodStart, periodEnd };
}

export async function GET(req: Request): Promise<NextResponse> {
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const periodType = parsePeriod(url.searchParams.get("period_type"));

  const prisma = getPrisma();
  if (!prisma) {
    const body: AnnotationsResponse = {
      ok: true,
      periodType,
      dbReady: false,
      annotations: [],
      autoPriorYear: {},
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  }

  try {
    const { periodStart, periodEnd } = await resolvePeriodDates(prisma, periodType);
    const [annotations, autoMap] = await Promise.all([
      listAnnotations(prisma, periodType, periodStart),
      computeAutoPriorYear(prisma, periodType, periodEnd),
    ]);

    const autoPriorYear: AnnotationsResponse["autoPriorYear"] = {};
    for (const [k, v] of autoMap) autoPriorYear[k] = v;

    const body: AnnotationsResponse = {
      ok: true,
      periodType,
      dbReady: true,
      annotations,
      autoPriorYear,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[annotations] GET failed", e);
    return NextResponse.json(
      { ok: false, error: "query_error", detail: "주석 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // 입력면 게이트 — input INPUT(물류본부장/admin). 클라 신뢰 금지.
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
  const parsed = annotationUpsertSchema.safeParse(raw);
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
  const input = parsed.data;

  try {
    // periodStart 는 본문 값(ISO date) → UTC Date.
    const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
    const dto = await upsertAnnotation(prisma, {
      kind: input.kind,
      periodType: input.periodType,
      periodStart,
      key: input.key,
      metricCode: "metricCode" in input ? input.metricCode : null,
      numValue: "numValue" in input ? input.numValue : null,
      textValue: "textValue" in input ? input.textValue : null,
      // 작성자 = 세션(서버 주입). 클라 전송값 무시.
      authorId: user.id,
    });
    return NextResponse.json(
      { ok: true, annotation: dto },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[annotations] POST failed", e);
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: "저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const guarded = await guardTab("input", "INPUT");
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
  const parsed = annotationDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", detail: "id 가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const ok = await deleteAnnotation(prisma, parsed.data.id);
    return NextResponse.json(
      { ok, detail: ok ? "삭제되었습니다." : "대상이 없습니다." },
      { status: ok ? 200 : 404, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[annotations] DELETE failed", e);
    return NextResponse.json(
      { ok: false, error: "delete_failed", detail: "삭제 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
