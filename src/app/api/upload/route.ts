/**
 * POST /api/upload — RAW .xlsx 멀티 업로드 → 검증·파싱·스테이징·적재.
 *
 * 근거: 아키텍처 §2 파이프라인 · §5-1 "POST /api/upload (input MANAGE)".
 *
 * 흐름: requireTab(input, MANAGE) → multipart 수신 → ingestFiles(검증·파싱·감지)
 *       → [DB 구성 시] persistSnapshot(STAGE→TRANSFORM→PUBLISH) / [미구성 시] 검증 리포트만.
 *
 * period 메타: 폼 필드 period_type(MONTH|CUMULATIVE)·period_end(YYYY-MM-DD) 수신.
 *   미상이면 당월 기본 + 오늘 기준 기간(MVP — 추후 시트 메타 자동추출로 강화).
 */

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { AuthzError, effectiveLevel, type AuthzUser } from "@/lib/authz";
import { parsePeriod, type PeriodType } from "@/lib/engine";
import { ingestFiles, type UploadFileInput } from "@/lib/ingest";
import { getPrisma } from "@/lib/prisma";
import { persistSnapshot } from "@/lib/server/persist";

/** period → 엔진 앵커(engine-cache 와 동일 — spec 부록C). */
const ANCHORS: Record<PeriodType, { salesDays: number; monthDays: number; factor: number }> = {
  MONTH: { salesDays: 21, monthDays: 30, factor: 1.22 },
  CUMULATIVE: { salesDays: 172, monthDays: 181, factor: 1.02 },
};

/** period 기간(start/end) 산출 — 폼 period_end 우선, 없으면 오늘. */
function periodRange(
  periodType: PeriodType,
  periodEndStr: string | null,
): { periodStart: Date; periodEnd: Date } {
  const end = periodEndStr ? new Date(periodEndStr) : new Date();
  const validEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  // start: 당월=월초, 누적=연초(근사 — 메타 자동추출 전 합리적 기본).
  const start =
    periodType === "CUMULATIVE"
      ? new Date(Date.UTC(validEnd.getUTCFullYear(), 0, 1))
      : new Date(Date.UTC(validEnd.getUTCFullYear(), validEnd.getUTCMonth(), 1));
  return { periodStart: start, periodEnd: validEnd };
}

export const runtime = "nodejs"; // SheetJS = Node 런타임 필요(엣지 X)
export const dynamic = "force-dynamic";

/** 인가: input MANAGE. 인증 미구성(provider 없음) 단계에서도 안전하게 차단. */
async function guard(): Promise<AuthzUser | NextResponse> {
  try {
    const session = await auth();
    const user = session?.user as AuthzUser | undefined;
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", detail: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    const lvl = effectiveLevel(user, "input");
    if (lvl !== "MANAGE") {
      return NextResponse.json(
        { ok: false, error: "forbidden", detail: "업로드(input MANAGE) 권한이 없습니다." },
        { status: 403 },
      );
    }
    return user;
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json(
        { ok: false, error: e.status === 401 ? "unauthorized" : "forbidden", detail: e.message },
        { status: e.status },
      );
    }
    // 인증 시스템 미구성 등 → 안전하게 401(클라엔 상세 누출 금지).
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "인증을 확인할 수 없습니다." },
      { status: 401 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const guarded = await guard();
  if (guarded instanceof NextResponse) return guarded;
  const uploader = guarded;

  // 1) multipart 파싱
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "multipart/form-data 가 아닙니다." },
      { status: 400 },
    );
  }

  const fileEntries = form.getAll("files").filter((v): v is File => v instanceof File);
  if (fileEntries.length === 0) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "업로드 파일(files)이 없습니다." },
      { status: 400 },
    );
  }

  // 2) 바이트 로드
  const inputs: UploadFileInput[] = [];
  for (const f of fileEntries) {
    const buf = new Uint8Array(await f.arrayBuffer());
    inputs.push({ name: f.name, size: f.size, bytes: buf });
  }

  // 3) 검증·파싱·감지·스테이징(메모리)
  let result;
  try {
    result = ingestFiles(inputs);
  } catch (e) {
    // 상세는 서버 로그, 클라엔 안전 메시지(에러 누출 방지).
    console.error("[upload] ingest failed", e);
    return NextResponse.json(
      { ok: false, error: "ingest_error", detail: "파일 처리 중 오류가 발생했습니다." },
      { status: 422 },
    );
  }

  // 4) 검증 실패 → 422 + 리포트(어느 시트/헤더 누락인지).
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        blockedReason: result.blockedReason,
        sheetSet: result.sheetSet,
        files: result.files,
      },
      { status: 422 },
    );
  }

  // 5) DB 적재 — Neon 구성 시 STAGE→TRANSFORM→PUBLISH. 미구성이면 리포트만.
  const prisma = getPrisma();
  const dbReady = prisma !== null;

  const reportBody = {
    totalRows: result.totalRows,
    sheetSet: result.sheetSet,
    files: result.files,
    recordCounts: Object.fromEntries(
      Object.entries(result.records).map(([k, v]) => [k, v?.length ?? 0]),
    ),
  };

  if (!dbReady || !prisma) {
    return NextResponse.json(
      {
        ok: true,
        staged: false,
        dbReady: false,
        ...reportBody,
        note: "Neon 미구성 — DB 적재 보류. 검증·파싱 리포트만 반환.",
      },
      { status: 200 },
    );
  }

  // period 메타(폼 → 기본값).
  const periodType = parsePeriod(form.get("period_type") as string | null);
  const { periodStart, periodEnd } = periodRange(
    periodType,
    (form.get("period_end") as string | null) ?? null,
  );

  try {
    const persisted = await persistSnapshot({
      prisma,
      uploadedById: uploader.id!, // guard 통과 = 인증된 user(id 존재)
      periodType,
      periodStart,
      periodEnd,
      records: result.records,
      anchors: ANCHORS[periodType],
    });

    return NextResponse.json(
      {
        ok: true,
        staged: true,
        dbReady: true,
        snapshotId: persisted.snapshotId,
        status: persisted.status,
        supersededId: persisted.supersededId,
        factRows: persisted.factRowCount,
        ...reportBody,
        note: "적재 완료 — CURRENT 스냅샷 갱신.",
      },
      { status: 200 },
    );
  } catch (e) {
    // 상세는 서버 로그·IngestLog, 클라엔 안전 메시지.
    console.error("[upload] persist failed", e);
    return NextResponse.json(
      { ok: false, error: "persist_error", detail: "적재 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
