/**
 * 데이터 품질 가드 — 희소 분모 비율 표기 보류 (작업지시 ②-B).
 *
 * 문제: 파생 비율(물류비율·재고일수·체화비중·판매율 등)이 **분모가 미미**하면
 *   14,000%·601일 같은 오해성 극단값이 뜬다. (예: 매출 1.2만원에 물류비 1.6만원 → 물류비율 140배)
 *
 * 해법: 분모(재고량/매출/소진액 등)가 임계 미만이면 비율을 화면에서 **"—"(흐린 마커)** +
 *   툴팁("분모 미미 — 참고 불가")으로 표시. ★원본 값은 유지(데이터 손실 금지) — 표시만 가드.
 *
 * 일관성: 3뷰(아이템 engine · 매장 store · 상품 product)가 이 모듈의 동일 헬퍼를 쓴다.
 *   임계는 합리적 상수(설정 가능). 비율은 number|null(null=분모0 IFERROR 공란, 가드 대상 아님).
 */

/**
 * 비율 분모 임계 — 이 미만이면 비율 표기 보류.
 *  amount(금액·원) = 100만원. 재고액·매출·소진액 등 큰 단위 분모.
 *  qty(수량·PCS)   = 50개.   입고량·출고량 등 수량 분모.
 *
 * 근거: 실 RAW 단위에서 100만원/50개 미만의 분모는 단일 SKU·점포의 잡음 수준이라
 *   파생 비율이 통계적으로 무의미(예: 매출 12,000원에 물류비율 14,000%). 휴리스틱 상수.
 */
export const RATIO_DENOM_MIN = {
  /** 금액 기준 분모 임계(원). */
  amount: 1_000_000,
  /** 수량 기준 분모 임계(PCS). */
  qty: 50,
} as const;

export type DenomUnit = keyof typeof RATIO_DENOM_MIN;

/** 가드 판정 결과 — 원본 값 보존 + 보류 여부. */
export interface GuardedRatio {
  /** 원본 비율값(손실 금지). null=분모0 공란(이미 빈칸). */
  value: number | null;
  /** 표기 보류 여부(true=분모 미미 → "—"). */
  suppressed: boolean;
  /** 보류 사유(툴팁용). */
  reason?: string;
}

const SUPPRESS_REASON = "분모 미미 — 참고 불가";

/** 분모가 임계 미만(또는 null)인지 — true 면 비율 표기 보류 대상. */
export function shouldSuppressRatio(
  denom: number | null | undefined,
  min: number,
): boolean {
  if (denom == null || !Number.isFinite(denom)) return true;
  return Math.abs(denom) < min;
}

/**
 * 비율 + 분모 → 가드 결과.
 * @param ratio 파생 비율값(null=분모0 공란 — 가드 아님, 이미 빈칸).
 * @param denom 비율의 분모(재고량/매출/소진액 등).
 * @param min   분모 임계(RATIO_DENOM_MIN.amount|qty).
 */
export function guardRatio(
  ratio: number | null,
  denom: number | null | undefined,
  min: number,
): GuardedRatio {
  // 이미 null(분모0 IFERROR 공란)이면 가드 무관 — 빈칸 그대로.
  if (ratio == null) return { value: null, suppressed: false };
  if (shouldSuppressRatio(denom, min)) {
    return { value: ratio, suppressed: true, reason: SUPPRESS_REASON };
  }
  return { value: ratio, suppressed: false };
}

/**
 * 가드 + 포맷을 한 번에 — 보류면 "—", 아니면 fmt(value).
 * @returns text 표시문자열 · suppressed 보류여부(셀 흐림·툴팁용).
 */
export function formatGuardedRatio(
  ratio: number | null,
  denom: number | null | undefined,
  min: number,
  fmt: (v: number | null) => string,
): { text: string; suppressed: boolean; reason?: string } {
  const g = guardRatio(ratio, denom, min);
  if (g.suppressed) return { text: "—", suppressed: true, reason: g.reason };
  return { text: fmt(g.value), suppressed: false };
}

/** 보류 마커 텍스트(공통). */
export const SUPPRESS_MARK = "—";
export { SUPPRESS_REASON };
