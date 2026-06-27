/**
 * 엑셀 내보내기 비율 가드 (C14) — 화면(metric-guard)과 동일한 희소-분모 보류를 xlsx 셀에도 적용.
 *
 * 문제: 화면 tree-table·KPI 는 분모가 임계 미만이면 비율을 "—"(공란 마커)로 가린다(오해성 극단값 차단).
 *   그러나 엑셀 내보내기는 가드 없이 원시 비율(14,000% 등)을 그대로 써 화면과 불일치했다.
 *
 * 해법: export 의 비율 셀도 동일 가드 통과 → suppressed 면 SUPPRESS_MARK("—"), 아니면 포맷값.
 *   ★비-비율(가산 원시값: 입고량·재고액 등)은 가드 무관 — 그대로 출력(데이터 손실 금지).
 *
 * 일관성: 3 export(아이템·매장·상품)가 이 헬퍼를 공유 → 화면 가드와 단일 정의.
 */

import { guardRatio, SUPPRESS_MARK } from "@/lib/metric-guard";

/**
 * 비율 셀의 가드된 표시값.
 *   - min=null(가드 비대상 = 비-비율) → 원시 포맷값 그대로(format 함수 호출).
 *   - 분모 미미 → SUPPRESS_MARK("—") (화면과 동일).
 *   - 정상 → 포맷값.
 *
 * @param raw    원시 비율값(또는 비-비율 원시값). null=공란.
 * @param denom  비율 분모(가드 비대상이면 무시).
 * @param min    분모 임계(null=가드 비대상).
 * @param format raw → 셀값(number|string) 변환(빈값은 "").
 */
export function guardedExportCell(
  raw: number | null,
  denom: number | null | undefined,
  min: number | null,
  format: (v: number | null) => string | number,
): string | number {
  // 가드 비대상(비-비율) → 원시값 그대로.
  if (min == null) return format(raw);
  // 이미 공란(null = 분모0 IFERROR)이면 빈칸.
  if (raw == null) return format(null);
  const g = guardRatio(raw, denom, min);
  if (g.suppressed) return SUPPRESS_MARK;
  return format(g.value);
}
