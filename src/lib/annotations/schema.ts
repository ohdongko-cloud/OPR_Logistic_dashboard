/**
 * Annotation 입력 검증(zod) — POST /api/annotations 본문 스키마.
 *
 * kind 별 차등 검증(discriminatedUnion):
 *   - TARGET / PRIOR_YEAR / LOGI_COST : metricCode(허용목록) + numValue 필수.
 *   - REMARK / ACTION                 : textValue(비공백) 필수.
 *
 * 모든 입력 = 4키 노드(전사 루트 허용) + 기간(periodType·periodStart ISO date).
 * 작성자(authorId)는 본문에 받지 않음 — 서버가 세션에서 주입(클라 전송값 무시, 아키텍처 §4-3).
 */

import { z } from "zod";

import { TARGET_METRICS } from "./types";

/** ISO date(YYYY-MM-DD) 문자열. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");

/** 4키 노드(전사=빈문자열). 트림만, 화이트리스트는 엔진 차원이 보장. */
const nodeKey = z.object({
  gender: z.string().trim().max(20).default(""),
  newcarry: z.string().trim().max(20).default(""),
  season: z.string().trim().max(20).default(""),
  item: z.string().trim().max(40).default(""),
});

/** 목표/전년 지표코드 — 허용목록만(인젝션·오타 차단). */
const targetMetricEnum = z.enum(
  TARGET_METRICS as unknown as [string, ...string[]],
);

const periodType = z.enum(["MONTH", "CUMULATIVE"]);

/** 수치성(목표·전년·물류비) 공통. */
const numericBase = {
  periodType,
  periodStart: isoDate,
  key: nodeKey,
  metricCode: targetMetricEnum,
  numValue: z.number().finite(),
};

/** 텍스트성(비고·조치) 공통. */
const textBase = {
  periodType,
  periodStart: isoDate,
  key: nodeKey,
  textValue: z.string().trim().min(1, "내용을 입력하세요.").max(2000),
};

export const annotationUpsertSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TARGET"), ...numericBase }),
  z.object({ kind: z.literal("PRIOR_YEAR"), ...numericBase }),
  z.object({
    kind: z.literal("LOGI_COST"),
    periodType,
    periodStart: isoDate,
    key: nodeKey,
    // 물류비(수기)는 비용항목 코드(자유 코드 — 향후 7대비용). 우선 자유 문자열.
    metricCode: z.string().trim().min(1).max(40),
    numValue: z.number().finite(),
  }),
  z.object({ kind: z.literal("REMARK"), ...textBase }),
  z.object({ kind: z.literal("ACTION"), ...textBase }),
]);

export type AnnotationUpsertInput = z.infer<typeof annotationUpsertSchema>;

/**
 * 배치 upsert 본문 — annotation 업서트 배열(전부 검증·단일 트랜잭션 all-or-nothing).
 *
 * 근거: 백로그 C13. items 비어있으면 거부(no-op 방지). 상한(100)으로 페이로드 폭주 차단.
 *   각 항목은 단건과 동일 discriminatedUnion 검증 — 하나라도 형식 위반이면 전체 거부.
 */
export const annotationBatchSchema = z.object({
  items: z
    .array(annotationUpsertSchema)
    .min(1, "저장할 항목이 없습니다.")
    .max(100, "한 번에 최대 100건까지 저장할 수 있습니다."),
});

export type AnnotationBatchInput = z.infer<typeof annotationBatchSchema>;

export const annotationDeleteSchema = z.object({
  id: z.string().min(1),
});

export type AnnotationDeleteInput = z.infer<typeof annotationDeleteSchema>;
