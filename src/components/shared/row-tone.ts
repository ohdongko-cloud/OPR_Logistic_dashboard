/**
 * 집계(롤업)행 배경 톤 — 3뷰(엔진·매장·상품) 공통.
 *
 * UI 피드백 ②: 자식 있는 노드(전체·성별·신상이월·시즌·채널·브랜드 등 비-리프 = 집계/롤업)에
 *   행 전체 배경색을 부여해 상세(리프=아이템/SKU/점포/시즌소계 행, 흰 배경)와 뚜렷이 구분한다.
 *   상위 레벨일수록 진한 단계 톤(L0 전체=가장 진함 → L4=가장 옅음). 숫자 우측정렬·색상코딩은 유지.
 *
 * depth 기반(0=루트) — 각 뷰의 트리 깊이가 달라도 일관(엔진 0~4 · 매장/상품 0~2).
 * 톤 토큰은 globals.css 의 --agg-l0..l4(라이트/다크 분기) → Tailwind bg-agg-l*.
 */

/** 단계별 집계행 배경(인덱스=레벨). 상위일수록 진함. */
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
 *  - 집계행(비-리프) → depth 단계 톤(0..4 클램프).
 */
export function aggRowBg({ isLeaf, depth }: { isLeaf: boolean; depth: number }): string {
  if (isLeaf) return "bg-white";
  const i = Math.max(0, Math.min(AGG_BG.length - 1, depth));
  return AGG_BG[i];
}
