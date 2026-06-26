/**
 * GET /api/agg — 엔진 드릴다운 트리(① 물류 핵심지표).
 *
 * 데이터 출처: CURRENT FactKanban 스냅샷이 있으면 **DB**, 없으면 라이브파일 폴백
 *   (resolveKanban). 두 경로 모두 동일 KanbanRow[] → 응답 계약(tree·필드) 불변.
 *   엔진 출력은 이미 엑셀 100% 검증(engine-realfile.test) → 그대로 신뢰.
 *
 * 파라미터:
 *   period_type = 당월(기본) | 누적  (또는 MONTH|CUMULATIVE)
 *   gender·newcarry·season·item = 필터(선택, 진입점 점프)
 *
 * 인가: 출력면(logistics VIEW) — 인증 + VIEW 게이트(requireTab). 비인증 401, 권한부족 403.
 *       (작업지시: /api/agg·대시보드 = 인증+VIEW 강제.)
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import {
  buildDrilldownTree,
  flattenTree,
  parsePeriod,
  periodLabel,
  type AggResponse,
  type DrilldownFilter,
} from "@/lib/engine";
import { EngineDataError, resolveKanban } from "@/lib/server/kanban-source";

export const runtime = "nodejs"; // SheetJS·fs = Node 런타임
export const dynamic = "force-dynamic";

function pick(v: string | null): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트(logistics). 클라 신뢰 금지 — 서버단 강제.
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period_type"));
  const filter: DrilldownFilter = {
    gender: pick(url.searchParams.get("gender")),
    newcarry: pick(url.searchParams.get("newcarry")),
    season: pick(url.searchParams.get("season")),
    item: pick(url.searchParams.get("item")),
  };

  let resolved;
  try {
    resolved = await resolveKanban(period);
  } catch (e) {
    if (e instanceof EngineDataError) {
      return NextResponse.json(
        { ok: false, error: e.code, detail: e.message },
        { status: e.code === "missing_file" ? 503 : 422 },
      );
    }
    // 상세는 서버 로그, 클라엔 안전 메시지.
    console.error("[agg] engine failed", e);
    return NextResponse.json(
      { ok: false, error: "engine_error", detail: "집계 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
  const { kanban } = resolved;

  const t0 = performance.now();
  const tree = buildDrilldownTree(kanban, filter);
  const nodeCount = flattenTree(tree).length;

  const body: AggResponse = {
    ok: true,
    period,
    periodLabel: periodLabel(period),
    filter,
    tree,
    meta: {
      skuCount: kanban.length,
      nodeCount,
      builtAtMs: Math.round(performance.now() - t0),
      // 진단용(실수치 아님) — UI 무관, 출처 가시화.
      source: resolved.source,
    },
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
