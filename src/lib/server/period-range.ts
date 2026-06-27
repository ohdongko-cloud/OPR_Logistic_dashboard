/**
 * 업로드 귀속 기간(periodStart/periodEnd) 산출 — 멱등 키 정규화(리뷰 #4).
 *
 * ⚠️ periodEnd 를 **논리적 기간**으로 정규화한다:
 *   MONTH      = 해당 월의 말일,  CUMULATIVE = 해당 연도의 연말(12/31).
 *   → 같은 논리적 기간을 다른 '업로드 날짜'에 재적재해도 동일 periodEnd 가 되어
 *     supersede(persist*.ts) 가 이전 CURRENT 를 정확히 찾고, 중복 CURRENT 가 쌓이지 않는다.
 *
 * @db.Date 컬럼이라 시각은 무의미(날짜만 저장). UTC 기준으로 산출해 타임존 표류를 막는다.
 */

import { type PeriodType } from "@/lib/engine";

export function resolvePeriodRange(
  periodType: PeriodType,
  startStr: string | null,
  endStr: string | null,
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const parse = (s: string | null): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const anchor = parse(endStr) ?? now;
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  // periodEnd 정규화: 월말(MONTH) / 연말(CUMULATIVE).
  const periodEnd =
    periodType === "CUMULATIVE"
      ? new Date(Date.UTC(y, 11, 31))
      : new Date(Date.UTC(y, m + 1, 0)); // 다음달 0일 = 이번달 말일
  const explicitStart = parse(startStr);
  if (explicitStart) return { periodStart: explicitStart, periodEnd };
  // start 미상 → 당월=월초, 누적=연초.
  const periodStart =
    periodType === "CUMULATIVE"
      ? new Date(Date.UTC(y, 0, 1))
      : new Date(Date.UTC(y, m, 1));
  return { periodStart, periodEnd };
}
