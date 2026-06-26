/**
 * GET /api/product-agg — 상품③ 드릴다운 트리(전체→브랜드→시즌).
 *
 * 데이터 출처: CURRENT FactProductCum 스냅샷 있으면 DB, 없으면 라이브파일 폴백(resolveProduct).
 *   두 경로 모두 동일 facts → buildProductAggTree 동일 출력.
 *   엔진 출력은 아이템 엔진과 측정식 동치 검증(product-engine-realfile.test) → 그대로 신뢰.
 *
 * 파라미터:
 *   period_type = 누적(기본 — 슬3·4=누적뷰) | 당월
 *   brand       = 구매그룹 코드 (선택, 진입점 점프)
 *
 * 인가: 출력면(product VIEW) — 인증 + VIEW 게이트(guardTab). 비인증 401, 권한부족 403.
 *
 * ★자동 8필드만 값 채움. 자동불가 8(일자)·수기 3(annotation)은 뷰 placeholder/annotation 책임.
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import {
  buildProductAggTree,
  flattenProductAggTree,
  PRODUCT_FIELD_COUNTS,
} from "@/lib/engine-product";
import { resolveProduct, ProductDataError, type ProductPeriod } from "@/lib/server/product-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** period 파싱 — 기본 누적(슬3·4=누적뷰). */
function parseProductPeriod(v: string | null): ProductPeriod {
  if (!v) return "CUMULATIVE";
  const s = v.trim();
  if (s === "당월" || s.toUpperCase() === "MONTH") return "MONTH";
  return "CUMULATIVE";
}

function pickBrand(v: string | null): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트(product). 서버단 강제(클라 신뢰 금지).
  const guarded = await guardTab("product", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const period = parseProductPeriod(url.searchParams.get("period_type"));
  const brandCode = pickBrand(url.searchParams.get("brand"));

  let resolved;
  try {
    resolved = await resolveProduct(period);
  } catch (e) {
    if (e instanceof ProductDataError) {
      const status = e.code === "missing_file" ? 503 : 422;
      return NextResponse.json({ ok: false, error: e.code, detail: e.message }, { status });
    }
    console.error("[product-agg] engine failed", e);
    return NextResponse.json(
      { ok: false, error: "engine_error", detail: "상품 집계 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const t0 = performance.now();
  const tree = buildProductAggTree(resolved.facts, { brandCode });
  const nodeCount = flattenProductAggTree(tree).length;
  const brandCount = new Set(resolved.facts.map((f) => f.brandCode)).size;

  return NextResponse.json(
    {
      ok: true,
      view: "product",
      period,
      periodLabel: period === "CUMULATIVE" ? "누적" : "당월",
      filter: { brandCode },
      tree,
      meta: {
        brandCount,
        factCount: resolved.facts.length,
        nodeCount,
        fieldCounts: PRODUCT_FIELD_COUNTS, // auto 8 · na 8 · manual 3 (스펙 §2-E)
        builtAtMs: Math.round(performance.now() - t0),
        source: resolved.source,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
