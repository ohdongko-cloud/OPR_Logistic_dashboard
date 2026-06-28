/**
 * 가로 스크롤 동기(상단 프록시 ↔ 테이블 본문) — 순수 로직.
 *
 * UI 피드백: 페이지 전체가 세로로 스크롤되면서 테이블 가로 스크롤바가 본문 맨 아래(세로 끝)에만
 *   남아, 넓은 지표열을 좌우로 보려면 한참 내려가야 했다. → 헤더 위(컨트롤바 아래)에 sticky 로
 *   얇은 "프록시" 가로 스크롤바를 두고, 본문 컨테이너의 scrollLeft 와 양방향 동기한다.
 *
 * 동기 동작 중 브라우저 의존이 없는 순수부(클램프·재기록 게이트)만 여기 분리해 node 환경에서
 *   단위테스트한다(densityTokens 분리 전략과 동일). 실제 DOM 결선·리스너는 useHScrollSync 훅이 담당.
 */

/**
 * 프록시를 노출할 최소 넘침(px). 반올림·서브픽셀 오차 수준의 미세 오버플로에는
 *   프록시 스크롤바를 띄우지 않는다(불필요한 빈 바 방지).
 */
export const PROXY_THRESHOLD_PX = 2;

/** scrollLeft 동기 목표값을 [0, max] 로 클램프(음수·초과·비정상 max 안전화). */
export function clampScrollLeft(value: number, max: number): number {
  const safeMax = max > 0 ? max : 0;
  if (value < 0) return 0;
  if (value > safeMax) return safeMax;
  return value;
}

/**
 * 목표 scrollLeft 를 실제로 기록할지 판단 — 현재값과 (서브픽셀 이내로) 같으면 기록 안 함.
 *   동일값 재기록은 의미 없고, 스크롤 이벤트 상호 반영 시 무한 루프의 원인이 되므로 차단한다.
 */
export function shouldApplySync(current: number, desired: number): boolean {
  return Math.abs(current - desired) >= 1;
}
