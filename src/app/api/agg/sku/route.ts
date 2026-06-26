/**
 * GET /api/agg/sku — 아이템 리프(4키) 노드의 SKU 상세(모달용).
 *
 * 설계 §3: 아이템 클릭 → 해당 4키의 SKU grain(칸반 행) 상세.
 * 파라미터: period_type · gender · newcarry · season · item(필수 4키).
 */

import { NextResponse } from "next/server";

import { parsePeriod, skuDetailsFor, type FactKey } from "@/lib/engine";
import { EngineDataError, getKanban } from "@/lib/server/engine-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function req(v: string | null): string {
  return (v ?? "").trim();
}

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period_type"));
  const key: FactKey = {
    gender: req(url.searchParams.get("gender")),
    newcarry: req(url.searchParams.get("newcarry")),
    season: req(url.searchParams.get("season")),
    item: req(url.searchParams.get("item")),
  };
  if (!key.item) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "item(아이템) 키가 필요합니다." },
      { status: 400 },
    );
  }

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
    console.error("[agg/sku] engine failed", e);
    return NextResponse.json(
      { ok: false, error: "engine_error", detail: "SKU 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const skus = skuDetailsFor(kanban, key);
  return NextResponse.json(
    { ok: true, period, key, count: skus.length, skus },
    { headers: { "cache-control": "no-store" } },
  );
}
