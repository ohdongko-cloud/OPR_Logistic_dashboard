/**
 * 매장 RAW 블록·VLOOKUP col_index 핀고정 (spec 매장 §2·§3 + 실파일 실측).
 *
 * ★중요(spec §2 주의): 칸반 VLOOKUP col_index 는 **블록 시작열 기준 상대 인덱스**.
 *   엔진은 라벨이 아니라 col_index 를 그대로 재현한다(엑셀 동작 보존).
 *   예) 칸반 H13 = VLOOKUP($A13,'상품수불(지점)'!$B:$I,6,) → 블록 B:I 의 6번째열 = G(점간입고량).
 *
 * 좌(픽스)/우(전체) 다중블록: 같은 RAW 시트에 픽스·전체가 가로 병렬.
 * 블록은 시작열 letter + col_index(1-based) 로 측정값을 가리킨다.
 *
 * RAW 레이아웃(실측): 라벨=4행, 단위=5행, '전체 결과'=6행, 점포데이터=7행~.
 *   조인키 = B열(플랜트=점포코드), C열=지점명. 수불오차만 B=구매그룹코드·C=지점명.
 */

import { colLetter } from "@/lib/ingest/parse-workbook";

/** RAW 데이터 시작행(1-based) — '전체 결과'(6행) 다음. */
export const STORE_RAW_DATA_START = 7;

/** 블록 시작열 letter 의 0-based 컬럼 인덱스 + col_index → 절대 컬럼 letter. */
export function blockCol(startLetter: string, colIndex: number): string {
  const start = colIndexFromLetter(startLetter); // 0-based
  return colLetter(start + (colIndex - 1));
}

/** 'A'→0, 'B'→1, …, 'AA'→26. */
export function colIndexFromLetter(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/**
 * 매출상세분석 — 픽스블록 B:F / 전체블록 I:M.
 *   픽스: D=실매출액 E=총매출원가 F=판매수량 (블록 B:F → idx3=D, idx4=E, idx5=F)
 *   전체: K=실매출액 L=총매출원가 M=판매수량 (블록 I:M → idx3=K, idx4=L, idx5=M)
 */
export const SALES_FIX_BLOCK = "B"; // 픽스 코드키 B
export const SALES_ALL_BLOCK = "I"; // 전체 코드키 I

/** 기말재고(지점) — 픽스 B:E / 픽스시즌+공통 K:N / 전체 T:W. */
export const ENDINV_FIX_BLOCK = "B";
export const ENDINV_SUMMER_BLOCK = "K";
export const ENDINV_ALL_BLOCK = "T";

/** 기초재고(지점) — 픽스 B:E / 전체 K:N. */
export const OPENINV_FIX_BLOCK = "B";
export const OPENINV_ALL_BLOCK = "K";

/** 상품수불(지점) — 픽스 B:I / 전체 K:R. */
export const FLOW_FIX_BLOCK = "B";
export const FLOW_ALL_BLOCK = "K";

/** 수불오차 — 코드키 블록 B:H(idx6=G수량, idx7=H금액) / 이름키 블록 C:H(idx5=G수량, idx6=H금액). */
export const ERR_CODE_BLOCK = "B"; // 집계행: VLOOKUP($A,수불오차!$B$4:$H$46,6/7)
export const ERR_NAME_BLOCK = "C"; // 점포행: VLOOKUP($C,수불오차!$C$4:$H$46,5/6)
