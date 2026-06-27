/**
 * 영속화 파이프라인 — STAGE → TRANSFORM → PUBLISH (아키텍처 §2).
 *
 * 흐름:
 *   ① STAGE     : Snapshot(PROCESSING) 생성 → RawRow bulk insert(sheet별) + IngestLog
 *   ② TRANSFORM : runEngine(검증된 엔진) → FactKanban bulk insert(SKU grain) + IngestLog
 *   ③ PUBLISH   : 트랜잭션 — 동일 (periodType, periodEnd) 기존 CURRENT → SUPERSEDED,
 *                 신규 → CURRENT + IngestLog. 실패 시 신규 = FAILED(이전 CURRENT 보존).
 *
 * 시계열 불변(헌장 삭제금지): 스냅샷·팩트는 수정·삭제 안 함, status 전환만.
 * 멱등: 같은 기간 재적재 = 신규 스냅샷 + 이전 supersede(replace-by-supersede).
 */

import { PrismaClient } from "@prisma/client";

import { runEngine, type KanbanRow, type PeriodType } from "@/lib/engine";
import { type RawRowRecord } from "@/lib/ingest";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { kanbanToFactRows } from "./fact-to-kanban";

const CHUNK = 1000;

export interface PersistInput {
  prisma: PrismaClient;
  uploadedById: string;
  periodType: PeriodType;
  /** 귀속 기간(period 범위). 미상이면 호출부가 합리적 기본 제공. */
  periodStart: Date;
  periodEnd: Date;
  /** ingest 결과 records(sheet별 RawRow 구조체). */
  records: Partial<Record<SheetType, RawRowRecord[]>>;
  /** 엔진 앵커(당월/누적). */
  anchors: { salesDays: number; monthDays: number; factor: number };
  /** 원본 Blob URL(감사·재처리용, 선택). */
  blobUrl?: string | null;
}

export interface PersistResult {
  snapshotId: string;
  status: "CURRENT" | "FAILED";
  rawRowCount: number;
  factRowCount: number;
  supersededId: string | null;
}

/** 배열을 size 단위 청크로. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 전체 적재 파이프라인 실행. 성공 시 신규 스냅샷이 CURRENT.
 *
 * @returns 신규 snapshotId + 상태 + 적재 통계.
 */
export async function persistSnapshot(input: PersistInput): Promise<PersistResult> {
  const { prisma, uploadedById, periodType, periodStart, periodEnd, records, anchors, blobUrl } =
    input;

  // ── ① STAGE: Snapshot(PROCESSING) + RawRow ──
  const allRaw: Array<{ sheetType: SheetType; rowIndex: number; skuKey: string; data: unknown }> = [];
  for (const [sheetType, recs] of Object.entries(records) as [SheetType, RawRowRecord[]][]) {
    if (!recs) continue;
    for (const r of recs) {
      allRaw.push({
        sheetType,
        rowIndex: r.rowIndex,
        skuKey: r.skuKey ?? "",
        data: r.data,
      });
    }
  }

  const snapshot = await prisma.snapshot.create({
    data: {
      periodType,
      periodStart,
      periodEnd,
      status: "PROCESSING",
      uploadedById,
      rowCount: allRaw.length,
      blobUrl: blobUrl ?? null,
    },
  });
  const snapshotId = snapshot.id;

  await prisma.ingestLog.create({
    data: {
      snapshotId,
      phase: "STAGE",
      result: "OK",
      detail: { rawRows: allRaw.length, sheets: Object.keys(records) },
    },
  });

  try {
    // RawRow bulk insert (chunk).
    for (const c of chunk(allRaw, CHUNK)) {
      await prisma.rawRow.createMany({
        data: c.map((r) => ({
          snapshotId,
          sheetType: r.sheetType,
          rowIndex: r.rowIndex,
          skuKey: r.skuKey,
          // Prisma Json — RawRowRecord.data 는 직렬화 안전(string|number|boolean|null).
          data: r.data as object,
        })),
      });
    }

    // ── ② TRANSFORM: runEngine → FactKanban ──
    const { kanban } = runEngine({ records, anchors });
    const factRows = kanbanToFactRows(kanban, snapshotId);
    for (const c of chunk(factRows, CHUNK)) {
      await prisma.factKanban.createMany({ data: c });
    }
    await prisma.ingestLog.create({
      data: {
        snapshotId,
        phase: "TRANSFORM",
        result: "OK",
        detail: { kanbanRows: kanban.length, factRows: factRows.length },
      },
    });

    // ── ③ PUBLISH: 트랜잭션 — supersede 이전 CURRENT, 신규 → CURRENT ──
    // 멱등·단일진실원(리뷰 #4): 같은 (fileType=ITEM, periodType) 의 **모든** CURRENT 를 강등.
    //   periodEnd 는 resolvePeriodRange 에서 논리적 기간으로 정규화돼 보통 1건이지만,
    //   과거 비정규 날짜로 쌓인 stale CURRENT 까지 일괄 차단(다중 CURRENT 잔존 방지).
    //   fileType 필터 명시(이전엔 ITEM 경로에 fileType 누락 — STORE/PRODUCT 와 격리).
    const supersededId = await prisma.$transaction(async (tx) => {
      const prevCurrents = await tx.snapshot.findMany({
        where: {
          fileType: "ITEM",
          periodType,
          status: "CURRENT",
          id: { not: snapshotId },
        },
        select: { id: true },
      });
      if (prevCurrents.length > 0) {
        await tx.snapshot.updateMany({
          where: { id: { in: prevCurrents.map((p) => p.id) } },
          data: { status: "SUPERSEDED" },
        });
      }
      await tx.snapshot.update({
        where: { id: snapshotId },
        data: { status: "CURRENT" },
      });
      return prevCurrents[0]?.id ?? null;
    });

    await prisma.ingestLog.create({
      data: {
        snapshotId,
        phase: "PUBLISH",
        result: "OK",
        detail: { supersededId },
      },
    });

    return {
      snapshotId,
      status: "CURRENT",
      rawRowCount: allRaw.length,
      factRowCount: factRows.length,
      supersededId,
    };
  } catch (e) {
    // 실패 멱등: 신규 = FAILED, 이전 CURRENT 그대로 보존(재시도 안전).
    await prisma.snapshot.update({ where: { id: snapshotId }, data: { status: "FAILED" } }).catch(() => {});
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
 * CURRENT 스냅샷의 FactKanban → KanbanRow[] 복원(조회 경로).
 * 없으면 null(호출부가 라이브파일 폴백).
 */
export async function loadCurrentKanban(
  prisma: PrismaClient,
  periodType: PeriodType,
): Promise<{ kanban: KanbanRow[]; snapshotId: string } | null> {
  const snap = await prisma.snapshot.findFirst({
    where: { periodType, status: "CURRENT" },
    orderBy: { periodEnd: "desc" },
    select: { id: true },
  });
  if (!snap) return null;

  const facts = await prisma.factKanban.findMany({
    where: { snapshotId: snap.id },
  });
  if (facts.length === 0) return null;

  // 동적 import 회피 — fact-to-kanban 복원.
  const { factRowsToKanban } = await import("./fact-to-kanban");
  return { kanban: factRowsToKanban(facts), snapshotId: snap.id };
}
