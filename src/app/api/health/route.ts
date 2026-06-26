/**
 * 헬스 체크 — /api/health
 * 배포/구동 확인용. 시크릿·실데이터 노출 없음(구성 여부 boolean 만).
 */
import { NextResponse } from "next/server";

import { isAuthConfigured, isDatabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "opr-logistic-dashboard",
      time: new Date().toISOString(),
      // 구성 여부만(값은 절대 노출 안 함).
      config: {
        database: isDatabaseConfigured(),
        auth: isAuthConfigured(),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
