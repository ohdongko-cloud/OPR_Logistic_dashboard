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
  view: "engine" | "store" | "product" | "admin" | "home" | "upload";
  /** 사이드바 아이콘(이모지 — 외부 의존 없이 가볍게). */
  icon: string;
  /** 관리자 전용 여부(RBAC) */
  adminOnly?: boolean;
  /** 미구현(스텁) 링크 — 사이드바에 흐리게 표시. */
  stub?: boolean;
};

/**
 * 좌측 사이드바 내비(레퍼런스 BI 양식).
 * 대시보드 · 데이터 업로드 · 물류 핵심지표(활성) · 매장 SCM · 상품 SCM · 관리자.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", view: "home", icon: "▦", stub: true },
  { href: "/upload", label: "데이터 업로드", view: "upload", icon: "↥", stub: true },
  { href: "/engine", label: "물류 핵심지표", view: "engine", icon: "◧" },
  { href: "/store", label: "매장 SCM", view: "store", icon: "▤", stub: true },
  { href: "/product", label: "상품 SCM", view: "product", icon: "◫", stub: true },
  { href: "/admin", label: "관리자", view: "admin", icon: "⚙", adminOnly: true, stub: true },
];

/** 랜딩 경로(설계 §1: 엔진 드릴다운). */
export const LANDING_PATH = "/engine";
