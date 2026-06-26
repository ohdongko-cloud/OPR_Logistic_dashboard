/**
 * GET /api/agg — 엔진 드릴다운 트리(① 물류 핵심지표).
 *
 * Neon 미구성 단계 → 서버가 실파일을 파싱·runEngine·트리화하여 반환(메모리 캐시).
 * 엔진 출력은 이미 엑셀 100% 검증(engine-realfile.test) → 그대로 신뢰.
 *
 * 파라미터:
 *   period_type = 당월(기본) | 누적  (또는 MONTH|CUMULATIVE)
 *   gender·newcarry·season·item = 필터(선택, 진입점 점프)
 *
 * 인가: 출력면(logistics VIEW). 현 단계 인증 provider 미구성 → 읽기는 허용(데모),
 *       업로드·변경 라우트만 가드 유지(보안 경계: 읽기 ≠ 쓰기).
 */

import { NextResponse } from "next/server";

import {
  buildDrilldownTree,
  flattenTree,
  parsePeriod,
  periodLabel,
  type AggResponse,
  type DrilldownFilter,
} from "@/lib/engine";
import { EngineDataError, getKanban } from "@/lib/server/engine-cache";

export const runtime = "nodejs"; // SheetJS·fs = Node 런타임
export const dynamic = "force-dynamic";

function pick(v: string | null): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export function GET(req: Request): NextResponse {
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period_type"));
  const filter: DrilldownFilter = {
    gender: pick(url.searchParams.get("gender")),
    newcarry: pick(url.searchParams.get("newcarry")),
    season: pick(url.searchParams.get("season")),
    item: pick(url.searchParams.get("item")),
  };

  let kanban;
  try {
    kanban = getKanban(period);
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
    },
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
