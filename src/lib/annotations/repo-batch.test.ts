import { describe, expect, it, vi } from "vitest";

import { upsertAnnotationsBatch, type UpsertParams } from "./repo";

/**
 * upsertAnnotationsBatch — 배열 전부를 단일 $transaction 으로 멱등 upsert(C13 원자화).
 *
 * 검증 초점(실 Neon 없이):
 *   ① 모든 upsert 가 **같은 tx 클라이언트** 위에서 실행(부분저장 근절의 핵심).
 *   ② 중간 실패 시 tx 가 throw 를 전파 → 호출부가 무반영 처리(부분 커밋 없음).
 *   ③ 동일 grain 중복 입력도 순차 실행으로 마지막 값에 수렴(병렬 중복 create 회피).
 */

interface Row {
  id: string;
  kind: string;
  periodType: string;
  periodStart: Date;
  metricCode: string | null;
  numValue: number | null;
  textValue: string | null;
  gender: string | null;
  newcarry: string | null;
  season: string | null;
  item: string | null;
  updatedAt: Date;
  author: { email: string } | null;
}

/**
 * 트랜잭션 의미를 흉내내는 Prisma 더블.
 *  - $transaction(fn): 스냅샷 복사본 위에서 fn 실행 → 성공 시 커밋, throw 시 롤백(원복).
 *  - annotation.findFirst/update/create: grain(kind+metricCode+키) 매칭.
 */
function makeFakePrisma(opts: { failOnNthCreate?: number } = {}) {
  let store: Row[] = [];
  let seq = 0;
  let createCount = 0;

  function buildClient(rows: Row[]) {
    return {
      annotation: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const f = rows.find(
            (r) =>
              r.kind === where.kind &&
              (r.metricCode ?? null) === (where.metricCode ?? null) &&
              (r.gender ?? null) === (where.gender ?? null) &&
              (r.newcarry ?? null) === (where.newcarry ?? null) &&
              (r.season ?? null) === (where.season ?? null) &&
              (r.item ?? null) === (where.item ?? null),
          );
          return f ? { id: f.id } : null;
        }),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const r = rows.find((x) => x.id === where.id)!;
            Object.assign(r, data);
            r.updatedAt = new Date();
            r.author = { email: "tester@eland.co.kr" };
            return { ...r };
          },
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createCount += 1;
          if (opts.failOnNthCreate && createCount === opts.failOnNthCreate) {
            throw new Error("simulated DB failure mid-batch");
          }
          const row: Row = {
            id: `row${++seq}`,
            kind: data.kind as string,
            periodType: data.periodType as string,
            periodStart: data.periodStart as Date,
            metricCode: (data.metricCode as string) ?? null,
            numValue: (data.numValue as number) ?? null,
            textValue: (data.textValue as string) ?? null,
            gender: (data.gender as string) ?? null,
            newcarry: (data.newcarry as string) ?? null,
            season: (data.season as string) ?? null,
            item: (data.item as string) ?? null,
            updatedAt: new Date(),
            author: { email: "tester@eland.co.kr" },
          };
          rows.push(row);
          return { ...row };
        }),
      },
    };
  }

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: ReturnType<typeof buildClient>) => Promise<unknown>) => {
      // 격리: 작업 사본 위에서 실행 → 성공 시 store 로 커밋, 실패 시 버림(롤백).
      const working = store.map((r) => ({ ...r }));
      const tx = buildClient(working);
      const result = await fn(tx); // throw 시 여기서 전파 → store 미반영(롤백).
      store = working; // 커밋.
      return result;
    }),
    // 커밋된 store 조회용(테스트 단언).
    _dump: () => store,
  };

  return prisma;
}

const key = { gender: "여성", newcarry: "신상", season: "", item: "" };
function target(metricCode: string, numValue: number): UpsertParams {
  return {
    kind: "TARGET",
    periodType: "MONTH",
    periodStart: new Date("2026-06-01T00:00:00.000Z"),
    key,
    metricCode,
    numValue,
    authorId: "u1",
  };
}

describe("upsertAnnotationsBatch — 단일 트랜잭션 all-or-nothing", () => {
  it("전부 성공 시 모든 항목 커밋", async () => {
    const prisma = makeFakePrisma();
    const res = await upsertAnnotationsBatch(prisma as never, [
      target("logiRatio", 0.12),
      target("sales", 9_500_000_000),
    ]);
    expect(res).toHaveLength(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma._dump()).toHaveLength(2);
  });

  it("중간 실패 시 전체 롤백 — 부분 커밋 없음(부분저장 근절)", async () => {
    // 2번째 create 에서 실패 → 1번째도 커밋되면 안 됨.
    const prisma = makeFakePrisma({ failOnNthCreate: 2 });
    await expect(
      upsertAnnotationsBatch(prisma as never, [target("logiRatio", 0.12), target("sales", 1)]),
    ).rejects.toThrow();
    // store 에 아무것도 커밋되지 않음(원자성).
    expect(prisma._dump()).toHaveLength(0);
  });

  it("동일 grain 중복 입력은 순차 upsert 로 마지막 값 수렴(중복 create 없음)", async () => {
    const prisma = makeFakePrisma();
    const res = await upsertAnnotationsBatch(prisma as never, [
      target("logiRatio", 0.1),
      target("logiRatio", 0.2),
    ]);
    expect(res).toHaveLength(2);
    // 같은 grain → 1행만 존재, 값은 마지막(0.2).
    const dump = prisma._dump();
    const logi = dump.filter((r) => r.metricCode === "logiRatio");
    expect(logi).toHaveLength(1);
    expect(logi[0].numValue).toBe(0.2);
  });
});
