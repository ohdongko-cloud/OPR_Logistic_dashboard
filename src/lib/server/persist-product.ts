/**
 * 상품③ 영속화 파이프라인 — STAGE → TRANSFORM → PUBLISH (아이템·매장 persist 와 동형).
 *
 * 흐름:
 *   ① Snapshot(PROCESSING, fileType=PRODUCT) 생성 + IngestLog(STAGE).
 *   ② TRANSFORM: buildProductFacts(검증 엔진) → FactProductCum bulk insert(브랜드×시즌 grain).
 *   ③ PUBLISH: 트랜잭션 — 동일 (fileType=PRODUCT, periodType, periodEnd) CURRENT → SUPERSEDED,
 *              신규 → CURRENT. 실패 시 신규 = FAILED(이전 CURRENT 보존).
 *
 * 시계열 불변(헌장 삭제금지): status 전환만. 멱등: 같은 기간 재적재 = replace-by-supersede.
 * ⚠️ RawRow 는 아이템 ingest 가 이미 적재(공유 RAW) — 상품은 FactProductCum(브랜드 grain)만 박제(YAGNI).
 */

import { PrismaClient } from "@prisma/client";

import { buildProductFacts, type ProductFactRow } from "@/lib/engine-product";
import { type RawRowRecord } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { factRowsToProduct, productFactsToRows } from "./product-fact";

const CHUNK = 500;

export interface PersistProductInput {
  prisma: PrismaClient;
  uploadedById: string;
  periodType: "MONTH" | "CUMULATIVE";
  periodStart: Date;
  periodEnd: Date;
  records: Partial<Record<SheetType, RawRowRecord[]>>;
  blobUrl?: string | null;
}

export interface PersistProductResult {
  snapshotId: string;
  status: "CURRENT" | "FAILED";
  factRowCount: number;
  supersededId: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function persistProductSnapshot(
  input: PersistProductInput,
): Promise<PersistProductResult> {
  const { prisma, uploadedById, periodType, periodStart, periodEnd } = input;

  const snapshot = await prisma.snapshot.create({
    data: {
      periodType,
      fileType: "PRODUCT",
      periodStart,
      periodEnd,
      status: "PROCESSING",
      uploadedById,
      rowCount: 0,
      blobUrl: input.blobUrl ?? null,
    },
  });
  const snapshotId = snapshot.id;

  await prisma.ingestLog.create({
    data: { snapshotId, phase: "STAGE", result: "OK", detail: { fileType: "PRODUCT" } },
  });

  try {
    const facts = buildProductFacts({ records: input.records });
    const factRows = productFactsToRows(facts, snapshotId);
    for (const c of chunk(factRows, CHUNK)) {
      await prisma.factProductCum.createMany({ data: c });
    }
    await prisma.snapshot.update({ where: { id: snapshotId }, data: { rowCount: factRows.length } });
    await prisma.ingestLog.create({
      data: {
        snapshotId,
        phase: "TRANSFORM",
        result: "OK",
        detail: { facts: facts.length, factRows: factRows.length },
      },
    });

    // 멱등·단일진실원(리뷰 #4): 같은 (fileType=PRODUCT, periodType) 의 **모든** CURRENT 를 강등.
    const supersededId = await prisma.$transaction(async (tx) => {
      const prevs = await tx.snapshot.findMany({
        where: {
          fileType: "PRODUCT",
          periodType,
          status: "CURRENT",
          id: { not: snapshotId },
        },
        select: { id: true },
      });
      if (prevs.length > 0) {
        await tx.snapshot.updateMany({
          where: { id: { in: prevs.map((p) => p.id) } },
          data: { status: "SUPERSEDED" },
        });
      }
      await tx.snapshot.update({ where: { id: snapshotId }, data: { status: "CURRENT" } });
      return prevs[0]?.id ?? null;
    });

    await prisma.ingestLog.create({
      data: { snapshotId, phase: "PUBLISH", result: "OK", detail: { supersededId } },
    });

    return { snapshotId, status: "CURRENT", factRowCount: factRows.length, supersededId };
  } catch (e) {
    await prisma.snapshot
      .update({ where: { id: snapshotId }, data: { status: "FAILED" } })
      .catch(() => {});
    await prisma.ingestLog
      .create({
        data: {
          snapshotId,
          phase: "TRANSFORM",
          result: "ERROR",
          detail: { message: e instanceof Error ? e.message : String(e) },
        },
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * CURRENT 상품 스냅샷의 FactProductCum → 복원(조회 경로). 없으면 null(라이브파일 폴백).
 */
export async function loadCurrentProduct(
  prisma: PrismaClient,
  periodType: "MONTH" | "CUMULATIVE",
): Promise<{ facts: ProductFactRow[]; snapshotId: string } | null> {
  const snap = await prisma.snapshot.findFirst({
    where: { fileType: "PRODUCT", periodType, status: "CURRENT" },
    orderBy: { periodEnd: "desc" },
    select: { id: true },
  });
  if (!snap) return null;
  const rows = await prisma.factProductCum.findMany({ where: { snapshotId: snap.id } });
  if (rows.length === 0) return null;
  const facts = factRowsToProduct(rows as never);
  return { facts, snapshotId: snap.id };
}
