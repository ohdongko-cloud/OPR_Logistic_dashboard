/**
 * GET /api/snapshots — 스냅샷 이력(상태) 목록 (아키텍처 §5-1, 추세·롤백용).
 *
 * 파라미터:
 *   period_type (선택 — MONTH|CUMULATIVE 필터)
 *   file_type   (선택 — ITEM|STORE|PRODUCT 필터)
 * 출력: 스냅샷 헤드(종류·기간·상태·업로더·시각·fact수) 배열. 실수치 미포함(메타만).
 * 인가: 조회(logistics VIEW) — 인증 + VIEW 게이트. DB 미구성 시 빈 목록.
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import { parsePeriod } from "@/lib/engine";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_TYPES = ["ITEM", "STORE", "PRODUCT"] as const;
type FileTypeFilter = (typeof FILE_TYPES)[number];

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트.
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period_type");
  const fileTypeParam = url.searchParams.get("file_type");

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: true, dbReady: false, snapshots: [], note: "Neon 미구성 — 이력 없음." },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const where: { periodType?: ReturnType<typeof parsePeriod>; fileType?: FileTypeFilter } = {};
  if (periodParam) where.periodType = parsePeriod(periodParam);
  if (fileTypeParam && (FILE_TYPES as readonly string[]).includes(fileTypeParam.toUpperCase())) {
    where.fileType = fileTypeParam.toUpperCase() as FileTypeFilter;
  }

  try {
    const snaps = await prisma.snapshot.findMany({
      where,
      orderBy: [{ uploadedAt: "desc" }, { periodEnd: "desc" }],
      take: 200,
      select: {
        id: true,
        fileType: true,
        periodType: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        uploadedAt: true,
        rowCount: true,
        uploadedBy: { select: { email: true, name: true } },
        _count: {
          select: { facts: true, raws: true, storeFacts: true, productFacts: true },
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        dbReady: true,
        count: snaps.length,
        snapshots: snaps.map((s) => {
          // fileType 별 대표 fact 수(ITEM=facts·STORE=storeFacts·PRODUCT=productFacts).
          const factRows =
            s.fileType === "STORE"
              ? s._count.storeFacts
              : s.fileType === "PRODUCT"
                ? s._count.productFacts
                : s._count.facts;
          return {
            id: s.id,
            fileType: s.fileType,
            periodType: s.periodType,
            periodStart: s.periodStart,
            periodEnd: s.periodEnd,
            status: s.status,
            uploadedAt: s.uploadedAt,
            rowCount: s.rowCount,
            uploadedBy: s.uploadedBy?.email ?? s.uploadedBy?.name ?? null,
            factRows,
            rawRows: s._count.raws,
          };
        }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[snapshots] query failed", e);
    return NextResponse.json(
      { ok: false, error: "query_error", detail: "이력 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
