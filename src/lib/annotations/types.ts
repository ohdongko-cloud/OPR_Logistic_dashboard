/**
 * 입력면(Annotation) 공용 타입 — 목표·전년·비고·조치·물류비(수기).
 *
 * 근거:
 *   - 02_파일분석/실적_모니터링_PPT보고서_분석.md Slide5 "목표 대비"(목표/전년/현재 + 조치/비고)
 *   - 04_시스템_설계/아키텍처_대시보드MVP.md §1-3 Annotation 모델 (기간×키 grain, kind별 num/text)
 *
 * Annotation grain = (kind, periodType, periodStart, 4키 노드, metricCode).
 *   - TARGET / PRIOR_YEAR / LOGI_COST : numValue + metricCode(지표코드)
 *   - REMARK / ACTION                 : textValue (metricCode 없음)
 *
 * 4키 노드(gender·newcarry·season·item) — NULL = 전사(루트). 트리 노드와 1:1 매핑.
 */

import { type FactKey } from "@/lib/engine";

/** Annotation 종류(Prisma AnnoKind 와 동일 문자열). */
export type AnnoKind = "REMARK" | "ACTION" | "TARGET" | "PRIOR_YEAR" | "LOGI_COST";

/** 기간 유형(Prisma PeriodType 와 동일). */
export type PeriodType = "MONTH" | "CUMULATIVE";

/**
 * 목표·전년 대상 지표코드 — FactRow 의 표시 가능한 핵심 지표 키.
 * Slide5 "목표 대비" 비교 대상(물류비율·센터재고일수 등)을 우선 지원.
 * (값은 FactRow 필드명과 정확히 일치 → 화면 병합이 단순 조인)
 */
export const TARGET_METRICS = [
  "logiRatio", // 물류비율 (Slide5 핵심)
  "dotsCtr", // 센터 재고일수
  "dotsTotal", // 총 재고일수
  "deadCtrPct", // 센터 체화비중
  "sales", // 실매출(추정)
  "logiCost", // 물류비
  "inQty", // 입고량
  "outQty", // 출고량
  "retQty", // 반품량
] as const;

export type TargetMetric = (typeof TARGET_METRICS)[number];

export function isTargetMetric(code: string): code is TargetMetric {
  return (TARGET_METRICS as readonly string[]).includes(code);
}

/** 지표코드 → 한국어 라벨(입력 UI·표시용). */
export const TARGET_METRIC_LABEL: Record<TargetMetric, string> = {
  logiRatio: "물류비율",
  dotsCtr: "센터 재고일수",
  dotsTotal: "총 재고일수",
  deadCtrPct: "센터 체화비중",
  sales: "실매출(추정)",
  logiCost: "물류비",
  inQty: "입고량",
  outQty: "출고량",
  retQty: "반품량",
};

/** 지표 표시 포맷(▲▼·달성률 계산 시 방향성 판단에도 사용). */
export type MetricFormat = "eok" | "pct" | "days" | "qty";

export const TARGET_METRIC_FORMAT: Record<TargetMetric, MetricFormat> = {
  logiRatio: "pct",
  dotsCtr: "days",
  dotsTotal: "days",
  deadCtrPct: "pct",
  sales: "eok",
  logiCost: "eok",
  inQty: "qty",
  outQty: "qty",
  retQty: "qty",
};

/**
 * 지표가 "낮을수록 좋은가"(비용·일수·체화·비율) 여부.
 * 달성 판정(목표대비 ▲▼)의 방향성: 비용성 지표는 현재<목표 = 달성.
 */
export const METRIC_LOWER_IS_BETTER: Record<TargetMetric, boolean> = {
  logiRatio: true,
  dotsCtr: true,
  dotsTotal: true,
  deadCtrPct: true,
  sales: false, // 매출은 높을수록 좋음
  logiCost: true,
  inQty: false,
  outQty: false,
  retQty: true, // 반품은 적을수록 좋음
};

/** 4키 노드 키(전사=모두 빈문자열). FactKey 와 동형. */
export type NodeKey = FactKey;

/** 빈 노드 키(전사 루트). */
export const ROOT_NODE_KEY: NodeKey = { gender: "", newcarry: "", season: "", item: "" };

/**
 * Annotation 1건(직렬화 안전 — API 응답·클라 공유).
 * Prisma Annotation 행을 JSON 친화 형태로 투영.
 */
export interface AnnotationDto {
  id: string;
  kind: AnnoKind;
  periodType: PeriodType;
  /** ISO date(YYYY-MM-DD) — 귀속 기간. */
  periodStart: string;
  gender: string | null;
  newcarry: string | null;
  season: string | null;
  item: string | null;
  metricCode: string | null;
  numValue: number | null;
  textValue: string | null;
  authorEmail: string | null;
  updatedAt: string;
}
