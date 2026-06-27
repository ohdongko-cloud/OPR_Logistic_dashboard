/**
 * POST /api/upload — SAP RAW .xlsx 업로드 → 검증·파싱 → 새 CURRENT 스냅샷 적재.
 *
 * 근거: 아키텍처 §2 파이프라인 · §5-1 "POST /api/upload (input MANAGE)" ·
 *       prisma/seed.ts(적재 레퍼런스 — 그대로 이식).
 *
 * 흐름:
 *   guard(input MANAGE) → multipart 수신 → 파일별 종류 자동판별(아이템/매장 · 폼 보조)
 *   → 아이템: ingestFiles → persistSnapshot(ITEM) + persistProductSnapshot(PRODUCT)
 *     매장:   ingestStoreFile → persistStoreSnapshot(STORE)
 *   → 멱등 PUBLISH(이전 CURRENT → SUPERSEDED). 응답 = 적재 요약.
 *
 * 폼 필드(모두 선택 — 미상이면 자동/기본):
 *   kind          : item | store      (자동판별 강제 오버라이드)
 *   period_type   : MONTH | CUMULATIVE (자동판별/기본)
 *   period_start  : YYYY-MM-DD         (귀속 기간 시작)
 *   period_end    : YYYY-MM-DD         (귀속 기간 끝)
 *   sales_days    : number             (앵커 — 칸반 자동추출 실패 시 수동)
 *   month_days    : number
 *   factor        : number
 *
 * 앵커: 아이템 파일은 칸반 D1/E1/F1(당월)·E1/F1/G1(누적)에서 자동추출. 실패 시 기본값.
 *   폼에 sales_days/month_days/factor 가 모두 오면 그 값으로 강제(자동추출 우선보다 명시 우선).
 */

import { NextResponse } from "next/server";

import { AuthzError, effectiveLevel, type AuthzUser } from "@/lib/authz";
import { auth } from "@/auth";
import {
  parsePeriod,
  type PeriodAnchors,
  type PeriodType,
} from "@/lib/engine";
import { ingestStoreFile, MONTH_STORE_PARAMS } from "@/lib/engine-store";
import {
  detectFileKind,
  extractAnchors,
  ingestFiles,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type UploadFileInput,
} from "@/lib/ingest";
import { getPrisma } from "@/lib/prisma";
import { clearEngineCache } from "@/lib/server/engine-cache";
import { resolvePeriodRange } from "@/lib/server/period-range";
import { persistProductSnapshot } from "@/lib/server/persist-product";
import { persistSnapshot } from "@/lib/server/persist";
import { persistStoreSnapshot } from "@/lib/server/persist-store";
import { clearProductCache } from "@/lib/server/product-source";
import { clearStoreCache } from "@/lib/server/store-source";

export const runtime = "nodejs"; // SheetJS = Node 런타임 필요(엣지 X)
export const dynamic = "force-dynamic";

/** 폼 앵커 오버라이드(3값 모두 유효할 때만). 없으면 null → 자동추출 사용. */
function formAnchors(form: FormData): PeriodAnchors | null {
  const num = (k: string): number | null => {
    const raw = form.get(k);
    if (raw === null) return null;
    const n = Number(String(raw).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const salesDays = num("sales_days");
  const monthDays = num("month_days");
  const factor = num("factor");
  if (salesDays !== null && monthDays !== null && factor !== null) {
    return { salesDays, monthDays, factor };
  }
  return null;
}

/** 인가: input MANAGE. 인증 미구성 단계에서도 안전하게 차단. */
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
    const lvl = await effectiveLevel(user, "input");
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
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "인증을 확인할 수 없습니다." },
      { status: 401 },
    );
  }
}

interface LoadedFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

/** 적재 결과 1건(파일/종류별). */
interface PersistOutcome {
  file: string;
  kind: "item" | "store";
  fileType: "ITEM" | "PRODUCT" | "STORE";
  periodType: PeriodType;
  snapshotId: string;
  status: string;
  factRows: number;
  supersededId: string | null;
  /** 앵커 출처(아이템만) */
  anchorSource?: "file" | "default";
  anchors?: PeriodAnchors;
}

export async function POST(req: Request): Promise<NextResponse> {
  const guarded = await guard();
  if (guarded instanceof NextResponse) return guarded;
  const uploader = guarded;

  if (!uploader.id) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "사용자 식별자가 없습니다." },
      { status: 401 },
    );
  }

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

  // 2a) 크기 사전검증 — 바이트를 메모리에 읽기 **전에** f.size 로 게이트(리뷰 #7).
  //     개별 50MB·누적 100MB 초과 시 413(메모리 할당 자체를 막아 DoS 방지).
  let totalSize = 0;
  for (const f of fileEntries) {
    if (f.size > MAX_SINGLE_FILE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "payload_too_large",
          detail: `파일 ${f.name} 이(가) ${(f.size / 1024 / 1024).toFixed(1)}MB 로 상한 ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB 를 초과합니다.`,
        },
        { status: 413 },
      );
    }
    totalSize += f.size;
  }
  if (totalSize > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "payload_too_large",
        detail: `총 업로드 ${(totalSize / 1024 / 1024).toFixed(1)}MB 가 상한 ${MAX_TOTAL_BYTES / 1024 / 1024}MB 를 초과합니다.`,
      },
      { status: 413 },
    );
  }

  // 2b) 바이트 로드(크기 통과분만).
  const loaded: LoadedFile[] = [];
  for (const f of fileEntries) {
    const buf = new Uint8Array(await f.arrayBuffer());
    loaded.push({ name: f.name, size: f.size, bytes: buf });
  }

  // 3) DB 준비 확인 — 미구성이면 적재 보류(검증 리포트만).
  const prisma = getPrisma();
  if (!prisma) {
    // 검증만 수행해 리포트.
    return NextResponse.json(
      {
        ok: true,
        staged: false,
        dbReady: false,
        note: "Neon 미구성 — DB 적재 보류.",
      },
      { status: 200 },
    );
  }

  // 4) 폼 메타(오버라이드).
  const kindOverride = (form.get("kind") as string | null)?.trim().toLowerCase() ?? null;
  const periodOverrideRaw = form.get("period_type") as string | null;
  const startStr = (form.get("period_start") as string | null) ?? null;
  const endStr = (form.get("period_end") as string | null) ?? null;
  const anchorOverride = formAnchors(form);

  const outcomes: PersistOutcome[] = [];
  const errors: Array<{ file: string; detail: string }> = [];
  /** 같은 요청 내 중복(같은 종류·기간) — 1건만 적재하고 나머지는 경고(침묵손실 방지, 리뷰 #5). */
  const skipped: Array<{ file: string; detail: string }> = [];
  /** 적재 키(kind|periodType|periodEnd) — 첫 파일만 통과, 이후 중복은 SKIPPED. */
  const seenKeys = new Set<string>();

  // 5) 파일별 종류 판별 → 적재.
  for (const lf of loaded) {
    try {
      const detected = detectFileKind(lf.bytes);
      const kind =
        kindOverride === "item" || kindOverride === "store"
          ? (kindOverride as "item" | "store")
          : detected.kind;

      if (kind === "unknown") {
        errors.push({
          file: lf.name,
          detail: "파일 종류를 판별할 수 없습니다(아이템/매장 선택 후 재시도).",
        });
        continue;
      }

      // 기간: 폼 오버라이드 > 자동판별 > 기본(MONTH).
      const periodType: PeriodType = periodOverrideRaw
        ? parsePeriod(periodOverrideRaw)
        : (detected.period ?? "MONTH");

      const { periodStart, periodEnd } = resolvePeriodRange(periodType, startStr, endStr);

      // 같은 요청에서 동일 (종류·기간) 가 2건+이면 첫 1건만 적재(나머지는 SKIPPED).
      // (둘째 파일의 supersede 가 방금 만든 첫째 CURRENT 를 조용히 강등하는 침묵손실 차단.)
      const dedupKey = `${kind}|${periodType}|${periodEnd.toISOString().slice(0, 10)}`;
      if (seenKeys.has(dedupKey)) {
        skipped.push({
          file: lf.name,
          detail: `동일 기간(${periodType}) ${kind === "item" ? "아이템" : "매장"} 파일 중복 — 1건만 적재됩니다(이 파일은 건너뜀).`,
        });
        continue;
      }
      seenKeys.add(dedupKey);

      if (kind === "store") {
        // ── 매장 파일 → ingestStore → persistStoreSnapshot(STORE) ──
        const sing = ingestStoreFile(lf.bytes);
        if (!sing.ok) {
          errors.push({ file: lf.name, detail: sing.blockedReason ?? "매장 검증 실패" });
          continue;
        }
        const sres = await persistStoreSnapshot({
          prisma,
          uploadedById: uploader.id,
          periodType: periodType === "CUMULATIVE" ? "CUMULATIVE" : "MONTH",
          periodStart,
          periodEnd,
          raw: sing.raw,
          roster: sing.roster,
          curation: sing.curation,
          errors: sing.errors,
          params: MONTH_STORE_PARAMS,
        });
        outcomes.push({
          file: lf.name,
          kind: "store",
          fileType: "STORE",
          periodType,
          snapshotId: sres.snapshotId,
          status: sres.status,
          factRows: sres.factRowCount,
          supersededId: sres.supersededId,
        });
        continue;
      }

      // ── 아이템 파일 → ingestFiles → persistSnapshot(ITEM) + persistProductSnapshot(PRODUCT) ──
      const ingest = ingestFiles([
        { name: lf.name, size: lf.size, bytes: lf.bytes } satisfies UploadFileInput,
      ]);
      if (!ingest.ok) {
        errors.push({
          file: lf.name,
          detail: ingest.blockedReason ?? "아이템 검증 실패",
        });
        continue;
      }

      // 앵커: 폼 오버라이드 > 칸반 자동추출 > 기본.
      const extracted = extractAnchors(lf.bytes, periodType);
      const anchors = anchorOverride ?? extracted.anchors;
      const anchorSource: "file" | "default" = anchorOverride
        ? "default"
        : extracted.source;

      const ires = await persistSnapshot({
        prisma,
        uploadedById: uploader.id,
        periodType,
        periodStart,
        periodEnd,
        records: ingest.records,
        anchors,
      });
      outcomes.push({
        file: lf.name,
        kind: "item",
        fileType: "ITEM",
        periodType,
        snapshotId: ires.snapshotId,
        status: ires.status,
        factRows: ires.factRowCount,
        supersededId: ires.supersededId,
        anchorSource,
        anchors,
      });

      // 상품(PRODUCT) 동시 갱신 — 동일 records 재사용(브랜드×시즌 grain).
      const pres = await persistProductSnapshot({
        prisma,
        uploadedById: uploader.id,
        periodType: periodType === "CUMULATIVE" ? "CUMULATIVE" : "MONTH",
        periodStart,
        periodEnd,
        records: ingest.records,
      });
      outcomes.push({
        file: lf.name,
        kind: "item",
        fileType: "PRODUCT",
        periodType,
        snapshotId: pres.snapshotId,
        status: pres.status,
        factRows: pres.factRowCount,
        supersededId: pres.supersededId,
      });
    } catch (e) {
      // 상세는 서버 로그·IngestLog, 클라엔 안전 메시지(에러 누출 방지).
      console.error("[upload] persist failed", lf.name, e);
      errors.push({ file: lf.name, detail: "적재 처리 중 오류가 발생했습니다." });
    }
  }

  // 5b) 라이브파일 인메모리 캐시 무효화(리뷰 #8) — DB CURRENT 가 갱신됐으므로 폴백 캐시가
  //     stale 옛 파싱결과를 내지 않도록. 아이템 적재 = 엔진(슬1·5)+상품 둘 다, 매장 = 매장.
  if (outcomes.some((o) => o.fileType === "ITEM" || o.fileType === "PRODUCT")) {
    clearEngineCache();
    clearProductCache();
  }
  if (outcomes.some((o) => o.fileType === "STORE")) {
    clearStoreCache();
  }

  // 6) 응답 — 부분 성공 허용(파일별 결과·오류·건너뜀 모두 반환).
  const anyLoaded = outcomes.length > 0;
  const skippedNote = skipped.length > 0 ? ` (중복 ${skipped.length}건 건너뜀)` : "";
  return NextResponse.json(
    {
      ok: errors.length === 0 && anyLoaded,
      staged: anyLoaded,
      dbReady: true,
      uploadedBy: uploader.email ?? null,
      outcomes,
      errors,
      skipped,
      note: anyLoaded
        ? errors.length === 0
          ? `적재 완료 — CURRENT 스냅샷 갱신.${skippedNote}`
          : `일부 파일만 적재됨(오류 확인).${skippedNote}`
        : "적재된 파일이 없습니다(오류 확인).",
    },
    { status: anyLoaded ? 200 : 422 },
  );
}
