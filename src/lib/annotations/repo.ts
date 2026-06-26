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
 * grain(kind, period, 노드키, metricCode) 멱등 upsert.
 * 동일 grain 존재 시 값·작성자·updatedAt 갱신, 없으면 생성.
 */
export async function upsertAnnotation(
  prisma: PrismaClient,
  p: UpsertParams,
): Promise<AnnotationDto> {
  const cols = nodeKeyToDbCols(p.key);
  // REMARK/ACTION 은 metricCode 가 없으므로 null 로 매칭(노드당 1건).
  const metricCode = p.metricCode ?? null;

  const existing = await prisma.annotation.findFirst({
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
    ? await prisma.annotation.update({
        where: { id: existing.id },
        data,
        include: { author: { select: { email: true } } },
      })
    : await prisma.annotation.create({
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
