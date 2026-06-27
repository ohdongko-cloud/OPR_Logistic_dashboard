/**
 * 전역 네비게이션(탭) 정의 — 설계문서 §1 화면 맵 기준.
 *
 * 3뷰(①물류 핵심지표 = 아이템 엔진 드릴다운 / ②매장 SCM / ③상품 SCM) + 관리자.
 * 랜딩 = 대시보드 홈(개요). 홈에서 3영역 요약·경보를 보고 각 뷰로 드릴다운.
 *   (당초 §7 Q1 가정은 엔진 랜딩이었으나, 작업지시로 홈 개요 랜딩으로 전환.)
 */
export type NavItem = {
  href: string;
  label: string;
  /** 설계문서상 뷰 식별(① ② ③) 또는 admin */
  view: "engine" | "store" | "product" | "admin" | "home" | "upload" | "input";
  /** 사이드바 아이콘(이모지 — 외부 의존 없이 가볍게). */
  icon: string;
  /** 관리자 전용 여부(RBAC) */
  adminOnly?: boolean;
  /** 미구현(스텁) 링크 — 사이드바에 흐리게 표시. */
  stub?: boolean;
};

/**
 * 좌측 사이드바 내비(레퍼런스 BI 양식).
 * 대시보드 · 물류 핵심지표 · 매장 SCM · 상품 SCM · 입력면(물류비예측) · 데이터 업로드 · 관리자.
 *   (UI 피드백 ④: "데이터 업로드"를 "관리자" 바로 위로 이동 — 분석·조회 메뉴 다음, 운영/관리 묶음.)
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "대시보드", view: "home", icon: "▦" },
  { href: "/engine", label: "물류 핵심지표", view: "engine", icon: "◧" },
  { href: "/store", label: "매장 SCM", view: "store", icon: "▤" },
  { href: "/product", label: "상품 SCM", view: "product", icon: "◫" },
  { href: "/input", label: "입력면(물류비예측)", view: "input", icon: "✎" },
  { href: "/upload", label: "데이터 업로드", view: "upload", icon: "↥" },
  { href: "/admin", label: "관리자", view: "admin", icon: "⚙", adminOnly: true },
];

/** 랜딩 경로(작업지시: 대시보드 홈 개요). 루트 `/` 는 여기로 리다이렉트. */
export const LANDING_PATH = "/home";
