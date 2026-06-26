/**
 * 매장② 영속화 파이프라인 — STAGE → TRANSFORM → PUBLISH (아이템 persist 와 동형).
 *
 * 흐름:
 *   ① Snapshot(PROCESSING, fileType=STORE) 생성 + IngestLog(STAGE).
 *   ② TRANSFORM: buildStoreKanban(검증 엔진) → FactStore bulk insert(점포 grain + 집계 마스터).
 *   ③ PUBLISH: 트랜잭션 — 동일 (fileType=STORE, periodType, periodEnd) CURRENT → SUPERSEDED,
 *              신규 → CURRENT. 실패 시 신규 = FAILED(이전 CURRENT 보존).
 *
 * 시계열 불변(헌장 삭제금지): status 전환만. 멱등: 같은 기간 재적재 = replace-by-supersede.
 * ⚠️ RawRow 는 매장 RAW 가 시트별 구조가 달라(좌/우 블록) 아이템 RawRow 스키마에 안 맞으므로
 *    MVP 는 FactStore(검증된 점포 grain)만 박제한다(YAGNI). 원본 재처리는 라이브파일 시드로.
 */

import { PrismaClient } from "@prisma/client";

import {
  buildStoreKanban,
  type StoreCuration,
  type StoreErrorIndex,
  type StoreParams,
  type StoreRoster,
} from "@/lib/engine-store";
import { type StoreRawData } from "@/lib/engine-store";

import { storeKanbanToFactRows } from "./store-fact";

const CHUNK = 500;

export interface PersistStoreInput {
  prisma: PrismaClient;
  uploadedById: string;
  periodType: "MONTH" | "CUMULATIVE";
  periodStart: Date;
  periodEnd: Date;
  raw: StoreRawData;
  roster: StoreRoster[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
  params: StoreParams;
  blobUrl?: string | null;
}

export interface PersistStoreResult {
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

export async function persistStoreSnapshot(
  input: PersistStoreInput,
): Promise<PersistStoreResult> {
  const { prisma, uploadedById, periodType, periodStart, periodEnd } = input;

  const snapshot = await prisma.snapshot.create({
    data: {
      periodType,
      fileType: "STORE",
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
    data: { snapshotId, phase: "STAGE", result: "OK", detail: { fileType: "STORE" } },
  });

  try {
    const kanban = buildStoreKanban({
      raw: input.raw,
      params: input.params,
      roster: input.roster,
    });
    const factRows = storeKanbanToFactRows(kanban, snapshotId, input.curation, input.errors);
    for (const c of chunk(factRows, CHUNK)) {
      await prisma.factStore.createMany({ data: c });
    }
    await prisma.snapshot.update({ where: { id: snapshotId }, data: { rowCount: factRows.length } });
    await prisma.ingestLog.create({
      data: {
        snapshotId,
        phase: "TRANSFORM",
        result: "OK",
        detail: { stores: kanban.length, factRows: factRows.length },
      },
    });

    const supersededId = await prisma.$transaction(async (tx) => {
      const prev = await tx.snapshot.findFirst({
        where: {
          fileType: "STORE",
          periodType,
          periodEnd,
          status: "CURRENT",
          id: { not: snapshotId },
        },
        select: { id: true },
      });
      if (prev) await tx.snapshot.update({ where: { id: prev.id }, data: { status: "SUPERSEDED" } });
      await tx.snapshot.update({ where: { id: snapshotId }, data: { status: "CURRENT" } });
      return prev?.id ?? null;
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
 * CURRENT 매장 스냅샷의 FactStore → 복원(조회 경로). 없으면 null(라이브파일 폴백).
 */
export async function loadCurrentStore(
  prisma: PrismaClient,
  periodType: "MONTH" | "CUMULATIVE",
  params: StoreParams,
): Promise<{
  kanban: import("@/lib/engine-store").StoreKanbanRow[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
  snapshotId: string;
} | null> {
  const snap = await prisma.snapshot.findFirst({
    where: { fileType: "STORE", periodType, status: "CURRENT" },
    orderBy: { periodEnd: "desc" },
    select: { id: true },
  });
  if (!snap) return null;
  const facts = await prisma.factStore.findMany({ where: { snapshotId: snap.id } });
  if (facts.length === 0) return null;

  const { factRowsToStore } = await import("./store-fact");
  const restored = factRowsToStore(facts as never, params);
  return { ...restored, snapshotId: snap.id };
}
