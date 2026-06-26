/**
 * GET /api/export/pptx — 엔진 집계를 **원본 PPT 양식 그대로** 채운 .pptx 다운로드.
 *
 * 핵심 요구: "기존 PPT 양식 변경 없이 집계해서 PPT로 다운로드"
 *   → 마스킹 템플릿(.pptx) XML의 표 셀 텍스트런만 계산값으로 치환(서식 100% 보존).
 *
 * 파라미터: period_type = 당월(기본) | 누적 (또는 MONTH|CUMULATIVE)
 *
 * 채움 범위(현 단계): 슬라이드1(① 물류 핵심지표 1P) — 30 데이터행 × 20 데이터열.
 *   슬라이드 2(매장 SCM)·3·4(상품 SCM)·5(목표대비) = fast-follow(템플릿 빈칸 유지).
 *
 * 인가: 출력면(VIEW) — /api/agg 와 동일 posture(데모 단계 읽기 허용). 업로드·변경만 가드.
 * 보안: 실데이터는 서버 메모리만(영속화/외부반출 없음). 템플릿은 마스킹본.
 */

import { NextResponse } from "next/server";

import { parsePeriod, periodLabel } from "@/lib/engine";
import { EngineDataError, getKanban } from "@/lib/server/engine-cache";
import { injectSlide1 } from "@/lib/pptx/inject";
import { TemplateMissingError, loadTemplateBytes } from "@/lib/pptx/template";

export const runtime = "nodejs"; // fs·SheetJS·fflate = Node 런타임
export const dynamic = "force-dynamic";

function fileName(label: string): string {
  // 한글 파일명 → RFC5987(filename*) 로 안전 전달.
  const base = `OPR_물류핵심지표_${label}_${new Date().toISOString().slice(0, 10)}.pptx`;
  return base;
}

export function GET(req: Request): NextResponse {
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period_type"));

  // 1) 엔진 칸반(검증된 Stage1) — 실파일 서버 read(캐시).
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

  // 3) 슬라이드1 주입(서식 보존) → .pptx 바이트.
  let out: Uint8Array;
  try {
    out = injectSlide1({ templateBytes, kanban, periodLabel: periodLabel(period) });
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
