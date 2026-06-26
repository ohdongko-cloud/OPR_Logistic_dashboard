/**
 * 시드 — 현재 실파일(아이템 당월·누적)을 영속화 파이프라인으로 적재.
 *
 * 결과: 부트스트랩 시스템 유저 + CURRENT 스냅샷 2건(MONTH·CUMULATIVE).
 *   → 대시보드(/api/agg)가 라이브파일이 아니라 DB CURRENT 에서 읽게 된다.
 *
 * ⚠️ 실데이터 파일·값은 레포에 커밋하지 않는다(보안). 이 스크립트는 시드타임에
 *    OPR_DATA_DIR(외부 절대경로)에서 "읽기만" 하고 사용자 Neon DB 에 적재한다.
 *
 * 멱등: 재실행 시 새 스냅샷을 만들고 이전 동기간 CURRENT 를 SUPERSEDED 로(replace).
 *   부트스트랩 유저는 upsert(중복 생성 안 함).
 *
 * 실행: npm run seed  (tsx prisma/seed.ts)
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

import { ingestFiles } from "../src/lib/ingest";
import { type PeriodType } from "../src/lib/engine";
import { ingestStoreFile, MONTH_STORE_PARAMS } from "../src/lib/engine-store";
import { persistSnapshot } from "../src/lib/server/persist";
import { persistStoreSnapshot } from "../src/lib/server/persist-store";
import { persistProductSnapshot } from "../src/lib/server/persist-product";

loadEnv(); // .env (DATABASE_URL)
loadEnv({ path: ".env.local" }); // OPR_DATA_DIR

const DEFAULT_DATA_DIR = "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";

const FILE_NAMES: Record<PeriodType, string> = {
  MONTH: "#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx",
  CUMULATIVE: "#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx",
};

/** 매장② 당월 파일(매장 누적본은 미동봉 — 당월만 시드). */
const STORE_FILE_MONTH = "#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx";

const ANCHORS: Record<PeriodType, { salesDays: number; monthDays: number; factor: number }> = {
  MONTH: { salesDays: 21, monthDays: 30, factor: 1.22 },
  CUMULATIVE: { salesDays: 172, monthDays: 181, factor: 1.02 },
};

/**
 * 데이터 기준 기간(고정 — 메타 자동추출 전 합리적 값).
 * 파일은 2026-06 모니터링 기준. 당월=6월, 누적=연초~6월.
 */
const PERIOD_RANGE: Record<PeriodType, { start: Date; end: Date }> = {
  MONTH: { start: new Date(Date.UTC(2026, 5, 1)), end: new Date(Date.UTC(2026, 5, 30)) },
  CUMULATIVE: { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 5, 30)) },
};

const BOOTSTRAP_EMAIL = process.env.MASTER_ADMIN_EMAIL ?? "seed@local";

function dataDir(): string {
  return process.env.OPR_DATA_DIR ?? DEFAULT_DATA_DIR;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 미설정 — Neon 연결 정보가 필요합니다(.env).");
  }
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // 부트스트랩 업로더(시스템). MASTER_ADMIN_EMAIL 있으면 그 계정을 ADMIN 으로.
    const uploader = await prisma.user.upsert({
      where: { email: BOOTSTRAP_EMAIL },
      update: {},
      create: {
        email: BOOTSTRAP_EMAIL,
        name: "시드 적재(시스템)",
        role: "ADMIN",
        active: true,
      },
    });

    for (const period of ["MONTH", "CUMULATIVE"] as PeriodType[]) {
      const filePath = path.join(dataDir(), FILE_NAMES[period]);
      if (!existsSync(filePath)) {
        console.warn(`[seed] 파일 없음(${period}) — 스킵: ${FILE_NAMES[period]}`);
        continue;
      }
      const buf = readFileSync(filePath);
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

      const ingest = ingestFiles([{ name: FILE_NAMES[period], size: buf.byteLength, bytes }]);
      if (!ingest.ok) {
        console.error(`[seed] 검증 실패(${period}): ${ingest.blockedReason}`);
        continue;
      }

      const { start, end } = PERIOD_RANGE[period];
      const res = await persistSnapshot({
        prisma,
        uploadedById: uploader.id,
        periodType: period,
        periodStart: start,
        periodEnd: end,
        records: ingest.records,
        anchors: ANCHORS[period],
      });

      console.log(
        `[seed] ${period} 적재 완료 — snapshot=${res.snapshotId} status=${res.status} ` +
          `raw=${res.rawRowCount} fact=${res.factRowCount}` +
          (res.supersededId ? ` (이전 ${res.supersededId} → SUPERSEDED)` : ""),
      );

      // ── 상품③ 시드(fileType=PRODUCT) — 동일 아이템 records 재사용, 브랜드×시즌 grain ──
      const pres = await persistProductSnapshot({
        prisma,
        uploadedById: uploader.id,
        periodType: period,
        periodStart: start,
        periodEnd: end,
        records: ingest.records,
      });
      console.log(
        `[seed] PRODUCT ${period} 적재 완료 — snapshot=${pres.snapshotId} status=${pres.status} ` +
          `fact=${pres.factRowCount}` +
          (pres.supersededId ? ` (이전 ${pres.supersededId} → SUPERSEDED)` : ""),
      );
    }

    // ── 매장② 당월 시드(fileType=STORE) ──
    const storePath = path.join(dataDir(), STORE_FILE_MONTH);
    if (existsSync(storePath)) {
      const sbuf = readFileSync(storePath);
      const sbytes = new Uint8Array(sbuf.buffer, sbuf.byteOffset, sbuf.byteLength);
      const sing = ingestStoreFile(sbytes);
      if (!sing.ok) {
        console.error(`[seed] 매장 검증 실패: ${sing.blockedReason}`);
      } else {
        const { start, end } = PERIOD_RANGE.MONTH;
        const sres = await persistStoreSnapshot({
          prisma,
          uploadedById: uploader.id,
          periodType: "MONTH",
          periodStart: start,
          periodEnd: end,
          raw: sing.raw,
          roster: sing.roster,
          curation: sing.curation,
          errors: sing.errors,
          params: MONTH_STORE_PARAMS,
        });
        console.log(
          `[seed] STORE MONTH 적재 완료 — snapshot=${sres.snapshotId} status=${sres.status} ` +
            `fact=${sres.factRowCount}` +
            (sres.supersededId ? ` (이전 ${sres.supersededId} → SUPERSEDED)` : ""),
        );
      }
    } else {
      console.warn(`[seed] 매장 파일 없음 — 스킵: ${STORE_FILE_MONTH}`);
    }

    // 결과 요약(증거).
    const current = await prisma.snapshot.findMany({
      where: { status: "CURRENT" },
      select: {
        id: true,
        fileType: true,
        periodType: true,
        periodEnd: true,
        _count: { select: { facts: true, storeFacts: true } },
      },
      orderBy: [{ fileType: "asc" }, { periodType: "asc" }],
    });
    console.log("[seed] CURRENT 스냅샷:");
    for (const s of current) {
      const cnt = s.fileType === "STORE" ? s._count.storeFacts : s._count.facts;
      console.log(
        `  - ${s.fileType} ${s.periodType} (periodEnd=${s.periodEnd.toISOString().slice(0, 10)}) fact=${cnt}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[seed] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
