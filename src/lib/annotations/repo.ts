/**
 * Annotation 영속 계층 — DB(Prisma) CRUD + 전년 자동 계산.
 *
 * - listAnnotations  : 기간(periodType, periodStart)의 모든 주석 → AnnotationDto[].
 * - upsertAnnotation : (kind, period, 노드키, metricCode) grain 으로 멱등 upsert.
 *                      같은 grain 재입력 = 값 갱신(이력은 updatedAt). 작성자=서버 주입.
 * - deleteAnnotation : id 로 삭제(입력 취소 — 헌장상 주석은 입력면 데이터라 물리삭제 허용).
 * - computeAutoPriorYear : 12개월 전 동기간 CURRENT 스냅샷에서 동일 키 전년값 자동 도출.
 *
 * 멱등 grain 키: Prisma 에 복합 unique 가 없어 findFirst→update/create 로 멱등 보장.
 */

import { PrismaClient } from "@prisma/client";

import {
  buildDrilldownTree,
  flattenTree,
  type KanbanRow,
  type PeriodType,
  type FactRow,
} from "@/lib/engine";

import { nodeKeyToDbCols, serializeNodeKey } from "./node-key";
import {
  isTargetMetric,
  type AnnotationDto,
  type NodeKey,
  type TargetMetric,
} from "./types";

/** Prisma Annotation 행 → DTO(직렬화 안전). */
function toDto(row: {
  id: string;
  kind: string;
  periodType: string;
  periodStart: Date;
  gender: string | null;
  newcarry: string | null;
  season: string | null;
  item: string | null;
  metricCode: string | null;
  numValue: unknown;
  textValue: string | null;
  updatedAt: Date;
  author?: { email: string | null } | null;
}): AnnotationDto {
  return {
    id: row.id,
    kind: row.kind as AnnotationDto["kind"],
    periodType: row.periodType as PeriodType,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    gender: row.gender,
    newcarry: row.newcarry,
    season: row.season,
    item: row.item,
    metricCode: row.metricCode,
    numValue: row.numValue == null ? null : Number(row.numValue),
    textValue: row.textValue,
    authorEmail: row.author?.email ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 기간의 모든 주석 조회(노드 병합용). periodStart 미지정 시 periodType 전체. */
export async function listAnnotations(
  prisma: PrismaClient,
  periodType: PeriodType,
  periodStart?: Date,
): Promise<AnnotationDto[]> {
  const rows = await prisma.annotation.findMany({
    where: { periodType, ...(periodStart ? { periodStart } : {}) },
    orderBy: { updatedAt: "asc" },
    include: { author: { select: { email: true } } },
  });
  return rows.map(toDto);
}

export interface UpsertParams {
  kind: AnnotationDto["kind"];
  periodType: PeriodType;
  periodStart: Date;
  key: NodeKey;
  metricCode?: string | null;
  numValue?: number | null;
  textValue?: string | null;
  authorId: string;
}

/**
 * Annotation upsert 가 쓰는 최소 클라이언트 표면.
 * PrismaClient 와 트랜잭션 클라이언트($transaction 콜백 인자) 양쪽을 받는다
 * (배치 원자화 — 동일 tx 위에서 findFirst→update/create 가 일관 실행되도록).
 */
type AnnotationClient = {
  annotation: Pick<PrismaClient["annotation"], "findFirst" | "update" | "create">;
};

/**
 * grain(kind, period, 노드키, metricCode) 멱등 upsert — 주어진 클라이언트(또는 tx) 위에서 실행.
 * 동일 grain 존재 시 값·작성자·updatedAt 갱신, 없으면 생성. 배치/단건 공통 코어.
 */
async function upsertAnnotationOn(
  client: AnnotationClient,
  p: UpsertParams,
): Promise<AnnotationDto> {
  const cols = nodeKeyToDbCols(p.key);
  // REMARK/ACTION 은 metricCode 가 없으므로 null 로 매칭(노드당 1건).
  const metricCode = p.metricCode ?? null;

  const existing = await client.annotation.findFirst({
    where: {
      kind: p.kind,
      periodType: p.periodType,
      periodStart: p.periodStart,
      gender: cols.gender,
      newcarry: cols.newcarry,
      season: cols.season,
      item: cols.item,
      metricCode,
    },
    select: { id: true },
  });

  const data = {
    numValue: p.numValue ?? null,
    textValue: p.textValue ?? null,
    authorId: p.authorId,
  };

  const row = existing
    ? await client.annotation.update({
        where: { id: existing.id },
        data,
        include: { author: { select: { email: true } } },
      })
    : await client.annotation.create({
        data: {
          kind: p.kind,
          periodType: p.periodType,
          periodStart: p.periodStart,
          gender: cols.gender,
          newcarry: cols.newcarry,
          season: cols.season,
          item: cols.item,
          metricCode,
          ...data,
        },
        include: { author: { select: { email: true } } },
      });

  return toDto(row);
}

/**
 * grain 멱등 upsert(단건) — 기존 호출부 호환 표면. 내부는 코어(upsertAnnotationOn) 위임.
 */
export async function upsertAnnotation(
  prisma: PrismaClient,
  p: UpsertParams,
): Promise<AnnotationDto> {
  return upsertAnnotationOn(prisma, p);
}

/**
 * 배치 upsert — 입력 배열 전부를 **단일 트랜잭션**으로 멱등 upsert(all-or-nothing).
 *
 * 근거: 백로그 C13 — Promise.all(N 단건 POST) 의 부분저장(일부만 반영) 근본 제거.
 *   하나라도 실패하면 prisma.$transaction 이 전부 롤백 → "성공=전체반영 / 실패=무반영".
 *
 * 작성자(authorId)는 호출부(라우트)가 세션에서 주입한 값을 각 항목에 박아 넣는다(클라 신뢰 금지).
 */
export async function upsertAnnotationsBatch(
  prisma: PrismaClient,
  items: UpsertParams[],
): Promise<AnnotationDto[]> {
  return prisma.$transaction(async (tx) =>
    // 순차 실행 — 같은 tx 위에서 grain 멱등(동일 grain 중복 입력도 마지막 값으로 수렴).
    // (병렬 시 같은 grain 의 findFirst 가 둘 다 미존재로 보고 중복 create 할 위험 → 순차.)
    sequentialUpsert(tx, items),
  );
}

/** tx 위에서 항목을 순차 upsert(grain 멱등 보장). */
async function sequentialUpsert(
  tx: AnnotationClient,
  items: UpsertParams[],
): Promise<AnnotationDto[]> {
  const out: AnnotationDto[] = [];
  for (const it of items) {
    out.push(await upsertAnnotationOn(tx, it));
  }
  return out;
}

/** 주석 삭제(입력 취소). 입력면 데이터 — 물리삭제 허용. */
export async function deleteAnnotation(
  prisma: PrismaClient,
  id: string,
): Promise<boolean> {
  const res = await prisma.annotation.deleteMany({ where: { id } });
  return res.count > 0;
}

/**
 * 전년 자동 계산 — 12개월 전 동기간(periodType 동일) CURRENT 스냅샷에서 동일 노드키 지표값.
 *
 * 구현: 대상 기간(targetPeriodStart)의 1년 전 periodEnd 를 가진 CURRENT 스냅샷의
 *   FactKanban → 엔진 rollup 으로 노드별 지표 재계산 → 노드키 × 지표코드 맵.
 * 이력이 없으면 빈 맵(수기 PRIOR_YEAR 가 폴백).
 *
 * 반환: Map<노드키문자열, Partial<Record<TargetMetric, number>>>.
 */
export async function computeAutoPriorYear(
  prisma: PrismaClient,
  periodType: PeriodType,
  targetPeriodEnd: Date,
): Promise<Map<string, Partial<Record<TargetMetric, number>>>> {
  const out = new Map<string, Partial<Record<TargetMetric, number>>>();

  // 1년 전 동월 말 ±15일 윈도(월말일 변동·적재일 편차 흡수).
  const prior = new Date(targetPeriodEnd);
  prior.setFullYear(prior.getFullYear() - 1);
  const lo = new Date(prior);
  lo.setDate(lo.getDate() - 20);
  const hi = new Date(prior);
  hi.setDate(hi.getDate() + 20);

  const snap = await prisma.snapshot.findFirst({
    where: {
      periodType,
      status: "CURRENT",
      periodEnd: { gte: lo, lte: hi },
    },
    orderBy: { periodEnd: "desc" },
    select: { id: true },
  });
  if (!snap) return out;

  const facts = await prisma.factKanban.findMany({ where: { snapshotId: snap.id } });
  if (facts.length === 0) return out;

  const { factRowsToKanban } = await import("@/lib/server/fact-to-kanban");
  const kanban: KanbanRow[] = factRowsToKanban(facts);

  // 전체 트리 rollup → 노드별 FactRow → 지표맵.
  const tree = buildDrilldownTree(kanban, {});
  for (const { node } of flattenTree(tree)) {
    const keyStr = serializeNodeKey({
      gender: node.key.gender ?? "",
      newcarry: node.key.newcarry ?? "",
      season: node.key.season ?? "",
      item: node.key.item ?? "",
    });
    out.set(keyStr, pickMetrics(node.metrics));
  }
  return out;
}

/** FactRow 에서 목표 비교 지원 지표만 추려 전년 자동값 맵으로. */
function pickMetrics(m: FactRow): Partial<Record<TargetMetric, number>> {
  const res: Partial<Record<TargetMetric, number>> = {};
  for (const code of Object.keys(m) as (keyof FactRow)[]) {
    if (isTargetMetric(code as string)) {
      const v = m[code];
      if (typeof v === "number") res[code as TargetMetric] = v;
    }
  }
  return res;
}
