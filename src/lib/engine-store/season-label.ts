/**
 * 시즌 라벨 동적화 (C12) — 매장 엔진의 "여름" 하드코딩을 스냅샷 시즌에 따라 동적 표기.
 *
 * 배경(실파일 실측):
 *   매장 칸반 헤더 텍스트에 시즌 명칭이 박혀있다.
 *     · 칸반 G6 = "여름비중" · P6 = "여름/공통\n재고량" · Q6 = "여름/공통\n재고액"
 *     · ※지점대시보드 F2 = "여름,공통" · O3 = "여름재고량"
 *   가을/겨울 RAW 가 올라오면 같은 K:N 블록(픽스시즌+공통 재고)에 그 시즌 재고가 들어오고
 *   헤더의 "여름" 부분만 "가을"/"겨울"로 바뀐다.
 *
 * ★불변(C12 핵심): "해당 시즌+공통 재고" 산식은 시즌 불변(VLOOKUP 블록 K:N 동일).
 *   바뀌는 건 **라벨(명칭)뿐**이다. 따라서 산식·필드(summerInvQty/summerPct/seasonPct)는 그대로 두고,
 *   표시 라벨만 헤더 텍스트에서 추출한 시즌명으로 동적 치환한다(default="여름" = 현행 비트단위 동일).
 *
 * 진실원천 우선순위: 칸반 헤더(G6/P6) > 대시보드 헤더(O3/F2) > default("여름").
 */

/** 한국 4계절(+공통은 시즌이 아니라 블록 보조어). 헤더 텍스트에서 이 중 하나를 탐지. */
export const KNOWN_SEASONS = ["봄", "여름", "가을", "겨울"] as const;
export type SeasonName = (typeof KNOWN_SEASONS)[number];

/** 시즌 명칭 default(현행 — 여름 스냅샷). 산식 불변, 라벨 폴백. */
export const DEFAULT_SEASON_LABEL: SeasonName = "여름";

/**
 * 헤더 텍스트(예 "여름비중"·"여름/공통\n재고량"·"가을,공통") → 시즌명.
 * 줄바꿈/구분자 무관하게 KNOWN_SEASONS 첫 등장을 반환. 없으면 null.
 */
export function detectSeasonFromHeader(text: string | null | undefined): SeasonName | null {
  if (!text) return null;
  const t = String(text).normalize("NFKC");
  for (const s of KNOWN_SEASONS) {
    if (t.includes(s)) return s;
  }
  return null;
}

/**
 * 여러 헤더 후보 중 첫 탐지 시즌명(우선순위 순서대로). 모두 실패 시 default.
 * @param candidates 칸반 G6 → P6 → 대시 O3 → F2 순서로 넘긴다(우선순위 = 배열 순서).
 */
export function resolveSeasonLabel(
  candidates: Array<string | null | undefined>,
): SeasonName {
  for (const c of candidates) {
    const s = detectSeasonFromHeader(c);
    if (s) return s;
  }
  return DEFAULT_SEASON_LABEL;
}

/** "{시즌}비중" — 칸반 G(summerPct)·대시 F(seasonPct) 표시 라벨. */
export function seasonShareLabel(season: string): string {
  return `${season}비중`;
}

/** "{시즌}재고량" — 대시 O(summerInvQty) 표시 라벨. */
export function seasonInvQtyLabel(season: string): string {
  return `${season}재고량`;
}

/** "{시즌}/공통 재고량" — 칸반 P 표시 라벨. */
export function seasonCommonInvQtyLabel(season: string): string {
  return `${season}/공통 재고량`;
}
