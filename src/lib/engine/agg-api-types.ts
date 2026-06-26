/**
 * /api/agg 응답·요청 계약 — 서버·클라이언트 공유 타입.
 *
 * 직렬화 안전(JSON)만 담는다. FactRow·TreeNode 는 number|null 만 → JSON 그대로 통과.
 */

import { type PeriodType } from "./types";
import { type TreeNode } from "./agg-tree";

/** period 문자열(API param) ↔ PeriodType. 한국어/영문 모두 수용. */
export function parsePeriod(v: string | null | undefined): PeriodType {
  if (!v) return "MONTH";
  const s = v.trim();
  if (s === "누적" || s.toUpperCase() === "CUMULATIVE") return "CUMULATIVE";
  return "MONTH"; // 기본 당월
}

export function periodLabel(p: PeriodType): string {
  return p === "CUMULATIVE" ? "누적" : "당월";
}

/** /api/agg 응답. */
export interface AggResponse {
  ok: true;
  period: PeriodType;
  periodLabel: string;
  /** 적용된 필터(에코). */
  filter: {
    gender?: string;
    newcarry?: string;
    season?: string;
    item?: string;
  };
  /** 드릴다운 트리(루트=전체/필터요약). */
  tree: TreeNode;
  /** 메타(증거·진단용 — 실수치 아님). */
  meta: {
    skuCount: number;
    nodeCount: number;
    builtAtMs: number;
    /** 데이터 출처(db=CURRENT 스냅샷 / livefile=라이브파일 폴백). 선택. */
    source?: "db" | "livefile";
  };
}

export interface AggErrorResponse {
  ok: false;
  error: string;
  detail?: string;
}
