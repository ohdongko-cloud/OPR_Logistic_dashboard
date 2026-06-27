/**
 * GET /api/upload/template?kind=item|store — 업로드 양식 템플릿(.xlsx) 다운로드.
 *
 * 업로더가 "어느 시트·어느 열에 무슨 값"을 넣을지 헷갈리지 않도록, 파서가 실제로 읽는
 * 좌표(시트명·열letter·헤더)를 그대로 박은 빈 양식을 내려준다.
 *   - 실데이터 0(헤더·안내·예시 더미만) → 비민감.
 *   - 단일 진실원 = src/lib/template/template-spec.ts (파서 소스 기반).
 *
 * 인가: 로그인 + logistics VIEW(가장 낮은 대시보드 탭). 양식 자체는 비민감이나
 *   미인증 외부 노출은 막는다(불필요 표면 최소화).
 */

import { NextResponse } from "next/server";

import { guardTab } from "@/lib/authz";
import {
  buildTemplateWorkbook,
  templateFileName,
  type TemplateKind,
} from "@/lib/template";

export const runtime = "nodejs"; // SheetJS = Node 런타임
export const dynamic = "force-dynamic";

function parseKind(raw: string | null): TemplateKind | null {
  if (raw === "item" || raw === "store") return raw;
  return null;
}

export async function GET(req: Request): Promise<NextResponse> {
  // 인증 + VIEW 게이트(logistics).
  const guarded = await guardTab("logistics", "VIEW");
  if (guarded instanceof NextResponse) return guarded;

  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "kind 는 item 또는 store 여야 합니다." },
      { status: 400 },
    );
  }

  const bytes = buildTemplateWorkbook(kind);
  if (!bytes) {
    return NextResponse.json(
      { ok: false, error: "template_error", detail: "템플릿 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  const name = templateFileName(kind);
  const asciiFallback = kind === "item" ? "OPR_upload_template_item.xlsx" : "OPR_upload_template_store.xlsx";
  const body = new Uint8Array(bytes); // 명시적 복사(detach 방지)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(body.byteLength),
      "cache-control": "no-store",
    },
  }) as unknown as NextResponse;
}
