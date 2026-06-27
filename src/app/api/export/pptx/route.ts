/**
 * GET /api/export/pptx — 엔진 집계를 **원본 PPT 양식 그대로** 채운 .pptx 다운로드.
 *
 * 핵심 요구: "기존 PPT 양식 변경 없이 집계해서 PPT로 다운로드"
 *   → 마스킹 템플릿(.pptx) XML의 표 셀 텍스트런만 계산값으로 치환(서식 100% 보존).
 *
 * 파라미터: period_type = 당월(기본) | 누적 (또는 MONTH|CUMULATIVE)
 *
 * 채움 범위:
 *   슬1(① 물류 핵심지표 1P) — 아이템 엔진 30행×20열.
 *   슬2(② 매장 SCM)         — 매장 엔진 전체/직영/점포14 × 매장 열(매장 데이터 있을 때).
 *   슬5(⑤ 목표 대비)        — 아이템 엔진 현재값 + Annotation(목표·전년·조치, DB 있을 때).
 *   슬3·4(③ 상품 SCM)       — 행↔노드 매핑 마스터 부재로 공란 유지(가짜값 금지).
 *
 * 데이터 출처: 슬1·2·5 모두 DB CURRENT 스냅샷 우선 → 없으면 라이브파일 폴백(resolveKanban·
 *   resolveStore — /api/agg 와 동일). Vercel(라이브파일 부재)에서도 DB 적재분으로 정상 출력.
 *
 * 인가: 출력면(logistics VIEW) — 인증 + VIEW 게이트(requireTab).
 * 보안: 실데이터는 서버 메모리만(영속화/외부반출 없음). 템플릿은 마스킹본.
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import { buildAnnotationOverlay } from "@/lib/annotations/overlay";
import { listAnnotations } from "@/lib/annotations/repo";
import { buildStoreDashboard, type StoreDashRow } from "@/lib/engine-store";
import { parsePeriod, periodLabel } from "@/lib/engine";
import { getPrisma } from "@/lib/prisma";
import { EngineDataError, resolveKanban } from "@/lib/server/kanban-source";
import { resolveStore, type StorePeriod } from "@/lib/server/store-source";
import { injectAll } from "@/lib/pptx/inject";
import { TemplateMissingError, loadTemplateBytes } from "@/lib/pptx/template";
import type { AnnotationOverlay } from "@/lib/annotations/overlay";

export const runtime = "nodejs"; // fs·SheetJS·fflate = Node 런타임
export const dynamic = "force-dynamic";

function fileName(label: string): string {
  // 한글 파일명 → RFC5987(filename*) 로 안전 전달.
  const base = `OPR_물류핵심지표_${label}_${new Date().toISOString().slice(0, 10)}.pptx`;
  return base;
}

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트(logistics).
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period_type"));

  // 1) 엔진 칸반(검증된 Stage1) — DB CURRENT 스냅샷 우선 → 없으면 라이브파일(슬2·5와 출처 일치).
  let kanban;
  try {
    ({ kanban } = await resolveKanban(period));
  } catch (e) {
    if (e instanceof EngineDataError) {
      return NextResponse.json(
        { ok: false, error: e.code, detail: e.message },
        { status: e.code === "missing_file" ? 503 : 422 },
      );
    }
    console.error("[export/pptx] engine failed", e);
    return NextResponse.json(
      { ok: false, error: "engine_error", detail: "집계 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  // 2) 마스킹 템플릿 로드.
  let templateBytes: Uint8Array;
  try {
    templateBytes = loadTemplateBytes();
  } catch (e) {
    if (e instanceof TemplateMissingError) {
      console.error("[export/pptx] template missing", e.message);
      return NextResponse.json(
        { ok: false, error: "template_missing", detail: "PPT 템플릿이 구성되지 않았습니다." },
        { status: 503 },
      );
    }
    throw e;
  }

  // 3) 매장 데이터(슬2) — graceful. 매장 데이터 없으면 슬2 공란(보고서는 정상 생성).
  let storeRows: StoreDashRow[] | undefined;
  try {
    const storePeriod: StorePeriod = period === "CUMULATIVE" ? "CUMULATIVE" : "MONTH";
    const resolved = await resolveStore(storePeriod);
    const dash = buildStoreDashboard(resolved.kanban, {
      params: resolved.params,
      curation: resolved.curation,
      errors: resolved.errors,
    });
    storeRows = dash.flatRows;
  } catch (e) {
    // 매장 데이터 부재/실패 = 비치명(슬2 공란). 핵심지표(슬1·5)는 그대로 출력.
    console.warn("[export/pptx] store data unavailable — slide2 left blank", e);
  }

  // 4) 주석(슬5 목표·전년·조치) — DB 있을 때만. 없으면 해당 칸 공란.
  let overlay: AnnotationOverlay | undefined;
  try {
    const prisma = getPrisma();
    if (prisma) {
      const annos = await listAnnotations(prisma, period);
      overlay = buildAnnotationOverlay(annos);
    }
  } catch (e) {
    console.warn("[export/pptx] annotations unavailable — slide5 targets blank", e);
  }

  // 5) 슬1·2·5 주입(서식 보존) → .pptx 바이트. 슬3·4 = 매핑 부재로 공란 유지.
  let out: Uint8Array;
  try {
    out = injectAll({
      templateBytes,
      kanban,
      storeRows,
      overlay,
      periodLabel: periodLabel(period),
    });
  } catch (e) {
    console.error("[export/pptx] inject failed", e);
    return NextResponse.json(
      { ok: false, error: "inject_failed", detail: "보고서 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const name = fileName(periodLabel(period));
  // ASCII fallback + UTF-8(filename*) 동시 제공(브라우저 호환).
  const asciiFallback = "OPR_logistics_report.pptx";
  const body = new Uint8Array(out); // 명시적 복사(detach 방지)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(body.byteLength),
      "cache-control": "no-store",
    },
  }) as unknown as NextResponse;
}
