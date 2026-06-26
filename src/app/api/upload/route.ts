/**
 * POST /api/upload — RAW .xlsx 멀티 업로드 → 검증·파싱·스테이징.
 *
 * 근거: 아키텍처 §2 파이프라인 · §5-1 "POST /api/upload (input MANAGE)".
 *
 * 흐름: requireTab(input, MANAGE) → multipart 수신 → ingestFiles(검증·파싱·감지)
 *       → [DB 구성 시] Snapshot+RawRow 적재 / [미구성 시] 검증 리포트만 반환.
 *
 * ⚠️ 현 단계 Neon 미구성 → DB 적재(STAGE/TRANSFORM/PUBLISH)는 보류.
 *    파싱·검증까지 동작하며 리포트(시트/행수/누락)를 반환한다.
 *    DB stage 는 getPrisma() 가 null 이 아닐 때만 활성(다음 단계에서 구현).
 */

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { AuthzError, effectiveLevel, type AuthzUser } from "@/lib/authz";
import { ingestFiles, type UploadFileInput } from "@/lib/ingest";
import { getPrisma } from "@/lib/prisma";

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

  // 5) DB 적재 — Neon 구성 시에만. 미구성이면 staged=false 로 리포트만.
  const prisma = getPrisma();
  const dbReady = prisma !== null;

  // (DB stage/transform/publish 는 다음 단계 — 여기선 자리만 명시)
  // if (dbReady) { ... Snapshot 생성 → RawRow createMany → TRANSFORM → PUBLISH ... }

  return NextResponse.json(
    {
      ok: true,
      staged: false, // DB 적재 보류(Neon 미구성). true 는 DB stage 구현 후.
      dbReady,
      totalRows: result.totalRows,
      sheetSet: result.sheetSet,
      // 시트별 행수 리포트(실데이터 값은 미포함 — 메타만).
      files: result.files,
      recordCounts: Object.fromEntries(
        Object.entries(result.records).map(([k, v]) => [k, v?.length ?? 0]),
      ),
      note: dbReady
        ? "DB 적재 로직 미구현(다음 단계). 검증·파싱만 완료."
        : "Neon 미구성 — DB 적재 보류. 검증·파싱 리포트만 반환.",
    },
    { status: 200 },
  );
}
