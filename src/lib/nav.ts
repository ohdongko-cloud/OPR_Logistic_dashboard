/**
 * 전역 네비게이션(탭) 정의 — 설계문서 §1 화면 맵 기준.
 *
 * 3뷰(①물류 핵심지표 = 아이템 엔진 드릴다운 / ②매장 SCM / ③상품 SCM) + 관리자.
 * 랜딩 = ① 물류 핵심지표(엔진 드릴다운). (§7 Q1 가정 — 사용자 확정 대기)
 *
 * 지금은 라우트 자리만. 각 화면 본문/위젯은 다음 단계 구현.
 */
export type NavItem = {
  href: string;
  label: string;
  /** 설계문서상 뷰 식별(① ② ③) 또는 admin */
  view: "engine" | "store" | "product" | "admin";
  /** 관리자 전용 여부(RBAC) */
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/engine", label: "① 물류 핵심지표", view: "engine" },
  { href: "/store", label: "② 매장 SCM", view: "store" },
  { href: "/product", label: "③ 상품 SCM", view: "product" },
  { href: "/admin", label: "관리자", view: "admin", adminOnly: true },
];

/** 랜딩 경로(설계 §1: 엔진 드릴다운). */
export const LANDING_PATH = "/engine";
