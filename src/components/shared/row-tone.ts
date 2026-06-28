/**
 * 집계(롤업)행 배경 톤 — 3뷰(엔진·매장·상품) 공통.
 *
 * 재설계(MI Reorder v2 양식 — 밝고 가독성): 자식 있는 노드(전체·성별·신상이월·시즌·채널·브랜드 등
 *   비-리프 = 집계/롤업)에 행 전체 배경을 **밝고 subtle**하게 부여한다. 글씨는 진한색(zinc-800 bold)
 *   → 밝은 배경 위 대비 충분. 리프(상세=아이템/SKU/점포/시즌말단)는 흰 배경으로 뚜렷이 구분.
 *
 * 이전 톤(어둡고 레벨별 동일색 → 구분 안 됨) 피드백 반영:
 *   **레벨별로 뚜렷이 다른 cool 톤**(L0 블루 → L1 인디고 → L2 틸 → L3·L4 슬레이트)으로
 *   트리 깊이를 한눈에 구분. 레인보우처럼 시끄럽지 않게 cool 계열로 조화. 숫자 정렬·색상코딩 유지.
 *
 * depth 기반(0=루트) — 각 뷰의 트리 깊이가 달라도 일관(엔진 0~4 · 매장/상품 0~2).
 * 톤 토큰은 globals.css 의 --agg-l0..l4(라이트/다크 분기, WCAG probe 주석) → Tailwind bg-agg-l*.
 */

/** 레벨별 집계행 배경(인덱스=깊이). 레벨마다 distinct cool 톤. */
export const AGG_BG = [
  "bg-agg-l0",
  "bg-agg-l1",
  "bg-agg-l2",
  "bg-agg-l3",
  "bg-agg-l4",
] as const;

/**
 * 행 배경 클래스 결정.
 *  - 리프(상세행) → 흰 배경(bg-white) — 집계행과 대비.
 *  - 집계행(비-리프) → depth 레벨 톤(0..4 클램프), 레벨마다 distinct.
 */
export function aggRowBg({ isLeaf, depth }: { isLeaf: boolean; depth: number }): string {
  if (isLeaf) return "bg-white";
  const i = Math.max(0, Math.min(AGG_BG.length - 1, depth));
  return AGG_BG[i];
}
