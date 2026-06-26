/**
 * GET /api/snapshots — 스냅샷 이력(상태) 목록 (아키텍처 §5-1, 추세·롤백용).
 *
 * 파라미터: period_type(선택 — 당월/누적 필터).
 * 출력: 스냅샷 헤드(기간·상태·업로더·시각·행수) 배열. 실수치 미포함(메타만).
 * 인가: 조회(VIEW) — 현 단계 읽기는 허용(agg 와 동일 경계). DB 미구성 시 빈 목록.
 */

import { NextResponse } from "next/server";

import { parsePeriod } from "@/lib/engine";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period_type");

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { ok: true, dbReady: false, snapshots: [], note: "Neon 미구성 — 이력 없음." },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const where = periodParam ? { periodType: parsePeriod(periodParam) } : {};

  try {
    const snaps = await prisma.snapshot.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { uploadedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        periodType: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        uploadedAt: true,
        rowCount: true,
        uploadedBy: { select: { email: true, name: true } },
        _count: { select: { facts: true, raws: true } },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        dbReady: true,
        count: snaps.length,
        snapshots: snaps.map((s) => ({
          id: s.id,
          periodType: s.periodType,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          status: s.status,
          uploadedAt: s.uploadedAt,
          rowCount: s.rowCount,
          uploadedBy: s.uploadedBy?.email ?? null,
          factRows: s._count.facts,
          rawRows: s._count.raws,
        })),
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
