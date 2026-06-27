/**
 * GET /api/home — 대시보드 홈(개요) 데이터 묶음.
 *
 * 한 번의 요청으로 홈 화면이 필요로 하는:
 *   - 요약 KPI(엔진 루트 + 매장 루트 핵심)
 *   - 경보 카드(악성 체화 · 고물류비율 · (−)재고 · 목표 미달) 상위 N
 *   - 최근 데이터 현황(CURRENT 스냅샷 메타 — 기간·업로더·시각·fact수)
 *   - 데이터 출처/가용성(graceful: 데이터 없으면 빈 상태)
 * 을 산출한다. 출력면 게이트(logistics VIEW) — 인증 + VIEW 강제(서버단).
 *
 * 가짜값 금지: 데이터 미가용(스냅샷·파일 없음)이면 빈 배열·null + dataReady=false.
 * 임계·가드는 lib/home/overview(기존 CRITICAL_THRESHOLDS·metric-guard 재사용).
 */

import { NextResponse } from "next/server";

import { listAnnotations } from "@/lib/annotations/repo";
import { type AnnotationDto } from "@/lib/annotations";
import { guardTab } from "@/lib/authz";
import { buildDrilldownTree, type TreeNode } from "@/lib/engine";
import {
  buildStoreAggTree,
  buildStoreDashboard,
  type StoreTreeNodeDto,
} from "@/lib/engine-store";
import {
  buildEngineAlerts,
  buildOverviewKpis,
  buildStoreAlerts,
  buildTargetMissAlerts,
  type HomeAlert,
  type OverviewKpi,
} from "@/lib/home/overview";
import { getPrisma } from "@/lib/prisma";
import { resolveKanban } from "@/lib/server/kanban-source";
import { resolveStore } from "@/lib/server/store-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_LIMIT = 5;

export interface HomeSnapshotMeta {
  id: string;
  fileType: "ITEM" | "STORE" | "PRODUCT";
  periodType: "MONTH" | "CUMULATIVE";
  periodStart: string;
  periodEnd: string;
  uploadedAt: string;
  uploadedBy: string | null;
  factRows: number;
}

export interface HomeResponse {
  ok: true;
  /** 엔진(아이템) 데이터 가용 — KPI·경보 산출됨. */
  engineReady: boolean;
  /** 매장 데이터 가용. */
  storeReady: boolean;
  /** DB(Neon) 구성 여부 — 스냅샷·주석 기능 가용. */
  dbReady: boolean;
  kpis: OverviewKpi[];
  alerts: HomeAlert[];
  /** CURRENT 스냅샷(fileType별 최신) — 최근 데이터 현황. */
  currentSnapshots: HomeSnapshotMeta[];
  /** 데이터 희소(가드) 안내 — 경보·KPI 가 비어있을 때 빈 상태 문구용. */
  sparse: boolean;
}

export async function GET(): Promise<NextResponse> {
  // 출력면 게이트 — 인증 + logistics VIEW. 서버단 강제(클라 신뢰 금지).
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  // ── 엔진(아이템) 트리 — 당월 기준. 데이터 없으면 graceful(null). ──
  let engineRoot: TreeNode | null = null;
  try {
    const { kanban } = await resolveKanban("MONTH");
    engineRoot = buildDrilldownTree(kanban, {});
  } catch {
    // missing_file 등 — 빈 상태(가짜값 금지).
    engineRoot = null;
  }

  // ── 매장 트리 — 당월. 누적 미동봉·파일 없음이면 graceful. ──
  let storeRoot: StoreTreeNodeDto | null = null;
  try {
    const resolved = await resolveStore("MONTH");
    const dashboard = buildStoreDashboard(resolved.kanban, {
      params: resolved.params,
      curation: resolved.curation,
      errors: resolved.errors,
    });
    storeRoot = buildStoreAggTree(dashboard, {});
  } catch {
    storeRoot = null;
  }

  // ── 주석(목표) — DB 있을 때만. 목표 미달 경보 산출용. ──
  const prisma = getPrisma();
  const dbReady = Boolean(prisma);
  let annotations: AnnotationDto[] = [];
  let currentSnapshots: HomeSnapshotMeta[] = [];
  if (prisma) {
    try {
      annotations = await listAnnotations(prisma, "MONTH");
    } catch {
      annotations = [];
    }
    try {
      currentSnapshots = await loadCurrentSnapshots(prisma);
    } catch {
      currentSnapshots = [];
    }
  }

  // ── KPI·경보 산출(순수 로직). ──
  const kpis = buildOverviewKpis(engineRoot, storeRoot);
  const alerts: HomeAlert[] = [];
  if (engineRoot) {
    alerts.push(...buildEngineAlerts(engineRoot, ALERT_LIMIT));
    alerts.push(...buildTargetMissAlerts(engineRoot, annotations, ALERT_LIMIT));
  }
  if (storeRoot) {
    alerts.push(...buildStoreAlerts(storeRoot, ALERT_LIMIT));
  }
  // 심각도(high 먼저) → kind 안정 정렬.
  const sevRank = { high: 0, medium: 1 } as const;
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const body: HomeResponse = {
    ok: true,
    engineReady: Boolean(engineRoot),
    storeReady: Boolean(storeRoot),
    dbReady,
    kpis,
    alerts,
    currentSnapshots,
    sparse: alerts.length === 0,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

/** fileType별 최신 CURRENT 스냅샷 메타(기간·업로더·시각·fact수). */
async function loadCurrentSnapshots(
  prisma: NonNullable<ReturnType<typeof getPrisma>>,
): Promise<HomeSnapshotMeta[]> {
  const snaps = await prisma.snapshot.findMany({
    where: { status: "CURRENT" },
    orderBy: [{ uploadedAt: "desc" }],
    select: {
      id: true,
      fileType: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      uploadedAt: true,
      uploadedBy: { select: { email: true, name: true } },
      _count: { select: { facts: true, storeFacts: true, productFacts: true } },
    },
  });
  // fileType별 1건(가장 최근)만.
  const seen = new Set<string>();
  const out: HomeSnapshotMeta[] = [];
  for (const s of snaps) {
    if (seen.has(s.fileType)) continue;
    seen.add(s.fileType);
    const factRows =
      s.fileType === "STORE"
        ? s._count.storeFacts
        : s.fileType === "PRODUCT"
          ? s._count.productFacts
          : s._count.facts;
    out.push({
      id: s.id,
      fileType: s.fileType as HomeSnapshotMeta["fileType"],
      periodType: s.periodType as HomeSnapshotMeta["periodType"],
      periodStart: s.periodStart.toISOString().slice(0, 10),
      periodEnd: s.periodEnd.toISOString().slice(0, 10),
      uploadedAt: s.uploadedAt.toISOString(),
      uploadedBy: s.uploadedBy?.email ?? s.uploadedBy?.name ?? null,
      factRows,
    });
  }
  return out;
}
