/**
 * 문자열 정규화 — 시트 시그니처 매칭 · SKU 조인키 정합용.
 *
 * 근거: 아키텍처 문서 §3-1 ⚠️ "norm(=trim+NFKC+공백제거) 필수
 *       (표기 불일치 시 0집계)" · 수식맵 §부록B.
 *
 * 두 변형:
 *  - normalizeForSig : 시그니처 매칭용. NFKC + 소문자 + 모든 공백/개행/괄호류 제거.
 *                      RAW 헤더는 줄바꿈(\n)·괄호·"(Now)" 같은 잡음이 많아 강하게 제거.
 *  - normalizeKey    : SKU 조인키용. NFKC + trim + 내부 공백 1칸 정규화(대소문자 보존).
 *                      SKU 코드는 대소문자가 의미를 가질 수 있어 lower 하지 않음.
 */

/** 시그니처(헤더) 매칭용 강한 정규화. */
export function normalizeForSig(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s ]+/g, "") // 공백·개행·NBSP 제거
    .replace(/[()[\]{}]/g, ""); // 괄호류 제거
}

/** SKU/조인키용 정규화 — 대소문자 보존, 양끝 trim, 내부 공백 제거. */
export function normalizeKey(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/[\s ]+/g, "");
}

/** 셀 값이 "비어있음"인지(null/undefined/공백문자열). */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}
