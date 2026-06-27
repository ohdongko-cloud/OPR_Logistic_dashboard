import { describe, expect, it, vi } from "vitest";

import { restoreSnapshot, RestoreError } from "./restore";

/**
 * restoreSnapshot — SUPERSEDED 스냅샷을 이전 CURRENT 로 되돌리는 단일 트랜잭션 로직.
 *
 * 검증 초점(실 Neon 없이 단위검증):
 *   ① 대상이 SUPERSEDED 여야 함(CURRENT/PROCESSING/FAILED·미존재 → RestoreError).
 *   ② 단일 $transaction 안에서 같은 (fileType, periodType) 의 현 CURRENT 강등 → 대상 승격
 *      **순서**(부분 유니크 인덱스 status=CURRENT 위반 없이: 강등이 승격보다 먼저).
 *   ③ 삭제 없음 — status 전환만(헌장 이력보존). IngestLog 에 RESTORE 기록.
 */

type Status = "CURRENT" | "SUPERSEDED" | "PROCESSING" | "FAILED";

interface FakeSnap {
  id: string;
  fileType: "ITEM" | "STORE" | "PRODUCT";
  periodType: "MONTH" | "CUMULATIVE";
  status: Status;
}

/**
 * 트랜잭션·쿼리 호출 순서를 기록하는 미니 Prisma 더블.
 * snapshot.update/updateMany 가 실제 순서대로 호출됐는지(강등→승격) 검증.
 */
function makeFakePrisma(snaps: FakeSnap[]) {
  const calls: string[] = [];
  const byId = new Map(snaps.map((s) => [s.id, { ...s }]));

  const txClient = {
    snapshot: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const s = byId.get(where.id);
        return s ? { ...s } : null;
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            fileType: string;
            periodType: string;
            status: string;
            id?: { not: string };
          };
        }) => {
          calls.push("findMany:current");
          return [...byId.values()].filter(
            (s) =>
              s.fileType === where.fileType &&
              s.periodType === where.periodType &&
              s.status === where.status &&
              (where.id?.not ? s.id !== where.id.not : true),
          );
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] } };
          data: { status: Status };
        }) => {
          calls.push(`updateMany:${data.status}`);
          for (const id of where.id.in) {
            const s = byId.get(id);
            if (s) s.status = data.status;
          }
          return { count: where.id.in.length };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { status: Status };
        }) => {
          calls.push(`update:${data.status}`);
          const s = byId.get(where.id);
          if (s) s.status = data.status;
          return { ...(s ?? {}) };
        },
      ),
    },
    ingestLog: {
      create: vi.fn(async ({ data }: { data: { phase: string; detail: unknown } }) => {
        calls.push(`ingestLog:${data.phase}`);
        return { id: "log1" };
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    snapshot: txClient.snapshot,
    ingestLog: txClient.ingestLog,
  };

  return { prisma, calls, byId };
}

describe("restoreSnapshot — SUPERSEDED → CURRENT 복원(단일 트랜잭션)", () => {
  it("강등(updateMany SUPERSEDED) 이 승격(update CURRENT) 보다 먼저 — 유니크 위반 차단 순서", async () => {
    const { prisma, calls, byId } = makeFakePrisma([
      { id: "cur", fileType: "ITEM", periodType: "MONTH", status: "CURRENT" },
      { id: "old", fileType: "ITEM", periodType: "MONTH", status: "SUPERSEDED" },
    ]);

    const res = await restoreSnapshot(prisma as never, "old");

    expect(res.restoredId).toBe("old");
    expect(res.demotedIds).toEqual(["cur"]);
    // 핵심: 강등이 승격보다 먼저(부분 유니크 인덱스 status=CURRENT 위반 없음).
    const demoteIdx = calls.indexOf("updateMany:SUPERSEDED");
    const promoteIdx = calls.indexOf("update:CURRENT");
    expect(demoteIdx).toBeGreaterThanOrEqual(0);
    expect(promoteIdx).toBeGreaterThan(demoteIdx);
    // 상태 전환 결과(삭제 없음 — 두 행 모두 존재).
    expect(byId.get("cur")!.status).toBe("SUPERSEDED");
    expect(byId.get("old")!.status).toBe("CURRENT");
    // RESTORE 기록(PUBLISH phase + detail.action=RESTORE).
    expect(prisma.ingestLog.create).toHaveBeenCalled();
  });

  it("현 CURRENT 가 없어도 복원 성공(대상만 승격) — 강등 대상 0건", async () => {
    const { prisma, byId } = makeFakePrisma([
      { id: "old", fileType: "STORE", periodType: "CUMULATIVE", status: "SUPERSEDED" },
    ]);
    const res = await restoreSnapshot(prisma as never, "old");
    expect(res.restoredId).toBe("old");
    expect(res.demotedIds).toEqual([]);
    expect(byId.get("old")!.status).toBe("CURRENT");
  });

  it("대상이 CURRENT 이면 거부(이미 현재 — 복원 불가)", async () => {
    const { prisma } = makeFakePrisma([
      { id: "cur", fileType: "ITEM", periodType: "MONTH", status: "CURRENT" },
    ]);
    await expect(restoreSnapshot(prisma as never, "cur")).rejects.toBeInstanceOf(RestoreError);
    await expect(restoreSnapshot(prisma as never, "cur")).rejects.toMatchObject({ status: 409 });
  });

  it("대상이 PROCESSING/FAILED 이면 거부", async () => {
    const { prisma } = makeFakePrisma([
      { id: "p", fileType: "ITEM", periodType: "MONTH", status: "PROCESSING" },
      { id: "f", fileType: "ITEM", periodType: "MONTH", status: "FAILED" },
    ]);
    await expect(restoreSnapshot(prisma as never, "p")).rejects.toBeInstanceOf(RestoreError);
    await expect(restoreSnapshot(prisma as never, "f")).rejects.toBeInstanceOf(RestoreError);
  });

  it("대상이 없으면 404 거부", async () => {
    const { prisma } = makeFakePrisma([]);
    await expect(restoreSnapshot(prisma as never, "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("같은 (fileType,periodType) 다중 CURRENT 도 모두 강등(stale 방어)", async () => {
    const { prisma, byId } = makeFakePrisma([
      { id: "c1", fileType: "PRODUCT", periodType: "MONTH", status: "CURRENT" },
      { id: "c2", fileType: "PRODUCT", periodType: "MONTH", status: "CURRENT" },
      { id: "old", fileType: "PRODUCT", periodType: "MONTH", status: "SUPERSEDED" },
      // 다른 격리키 CURRENT 는 건드리지 않음.
      { id: "other", fileType: "ITEM", periodType: "MONTH", status: "CURRENT" },
    ]);
    const res = await restoreSnapshot(prisma as never, "old");
    expect(res.demotedIds.sort()).toEqual(["c1", "c2"]);
    expect(byId.get("c1")!.status).toBe("SUPERSEDED");
    expect(byId.get("c2")!.status).toBe("SUPERSEDED");
    expect(byId.get("old")!.status).toBe("CURRENT");
    // 다른 격리키는 불변.
    expect(byId.get("other")!.status).toBe("CURRENT");
  });
});
