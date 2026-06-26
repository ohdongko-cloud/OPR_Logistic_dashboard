/**
 * 숫자 표시 포맷 — 천단위·억 환산·%·일·배·소수(설계 §2 단위표기).
 *
 * 액(원)은 큰 값이라 **억 환산**으로 표시(설계 와이어 "00.0억"). 비율은 %.
 * null(파생 분모0=공란) → "-".
 */

const KR = "ko-KR";

/** 금액(원) → 억 환산 표시. 예 2_875_308_522 → "28.8억". */
export function fmtEok(v: number | null | undefined): string {
  if (v == null) return "-";
  const eok = v / 1e8;
  return `${eok.toLocaleString(KR, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}억`;
}

/** 금액(원) 원단위 천단위 구분(SKU 상세 등 정밀표시용). */
export function fmtWon(v: number | null | undefined): string {
  if (v == null) return "-";
  return Math.round(v).toLocaleString(KR);
}

/** 수량(PCS) — 천단위, 정수. */
export function fmtQty(v: number | null | undefined): string {
  if (v == null) return "-";
  return Math.round(v).toLocaleString(KR);
}

/** 비율(0~1) → %. 예 0.137 → "13.7%". */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "-";
  return `${(v * 100).toLocaleString(KR, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** 일수(재고일수) → "00일". */
export function fmtDays(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toLocaleString(KR, { maximumFractionDigits: 0 })}일`;
}

/** 배수 → "0.0배". */
export function fmtMult(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toLocaleString(KR, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}배`;
}

/** 소수(일반) — 천단위. */
export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null) return "-";
  return v.toLocaleString(KR, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
