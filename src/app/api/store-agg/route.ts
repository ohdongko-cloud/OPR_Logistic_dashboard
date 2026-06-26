/**
 * GET /api/store-agg — 매장② 드릴다운 트리(전체→채널→점포).
 *
 * 데이터 출처: CURRENT FactStore 스냅샷 있으면 DB, 없으면 라이브파일 폴백(resolveStore).
 *   두 경로 모두 동일 { kanban, curation, errors } → buildStoreDashboard 동일 출력.
 *   엔진 출력은 엑셀 100% 검증(store-engine-realfile.test) → 그대로 신뢰.
 *
 * 파라미터:
 *   period_type = 당월(기본) | 누적  (매장 누적은 미동봉 → 503 graceful)
 *   channel     = 직영 | 중간관리 | 기타  (선택, 진입점 점프)
 *
 * 인가: 출력면(store VIEW) — 인증 + VIEW 게이트(requireTab). 비인증 401, 권한부족 403.
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import {
  buildStoreAggTree,
  buildStoreDashboard,
  flattenStoreAggTree,
  type StoreChannel,
} from "@/lib/engine-store";
import { resolveStore, StoreDataError, type StorePeriod } from "@/lib/server/store-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS: StoreChannel[] = ["직영", "중간관리", "기타"];

function parseStorePeriod(v: string | null): StorePeriod {
  if (!v) return "MONTH";
  const s = v.trim();
  if (s === "누적" || s.toUpperCase() === "CUMULATIVE") return "CUMULATIVE";
  return "MONTH";
}

function pickChannel(v: string | null): StoreChannel | undefined {
  const s = v?.trim();
  return s && (CHANNELS as string[]).includes(s) ? (s as StoreChannel) : undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트(store). 서버단 강제(클라 신뢰 금지).
  const guarded = await guardTab("store", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const period = parseStorePeriod(url.searchParams.get("period_type"));
  const channel = pickChannel(url.searchParams.get("channel"));

  let resolved;
  try {
    resolved = await resolveStore(period);
  } catch (e) {
    if (e instanceof StoreDataError) {
      const status = e.code === "missing_file" || e.code === "no_period" ? 503 : 422;
      return NextResponse.json({ ok: false, error: e.code, detail: e.message }, { status });
    }
    console.error("[store-agg] engine failed", e);
    return NextResponse.json(
      { ok: false, error: "engine_error", detail: "매장 집계 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const t0 = performance.now();
  const dashboard = buildStoreDashboard(resolved.kanban, {
    params: resolved.params,
    curation: resolved.curation,
    errors: resolved.errors,
  });
  const tree = buildStoreAggTree(dashboard, { channel });
  const nodeCount = flattenStoreAggTree(tree).length;

  return NextResponse.json(
    {
      ok: true,
      view: "store",
      period,
      periodLabel: period === "CUMULATIVE" ? "누적" : "당월",
      filter: { channel },
      tree,
      meta: {
        storeCount: resolved.kanban.length,
        nodeCount,
        builtAtMs: Math.round(performance.now() - t0),
        source: resolved.source,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
