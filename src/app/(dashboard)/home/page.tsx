import { redirect } from "next/navigation";

import { HomeView } from "@/components/home/home-view";
import { Topbar } from "@/components/shell/topbar";
import { requireTab, AuthzError } from "@/lib/authz";

/**
 * 대시보드 홈(개요) — 랜딩 화면.
 *
 * 게이트: requireTab("logistics","VIEW"). 비인증 → /login, 권한부족 → /login.
 *   (전 인증자가 출력탭 VIEW 기본 → 사실상 인증되면 접근. VIEW 미달은 예외적.)
 * 본문: 요약 KPI · 경보 카드 · 최근 데이터 현황 · 퀵링크(권한자 한정 일부).
 *
 * 근거: 작업지시 ①(대시보드 홈 신규 · 랜딩 전환) · 설계 §1 화면 맵 · VIEW 게이트(logistics).
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    await requireTab("logistics", "VIEW");
  } catch (e) {
    if (e instanceof AuthzError && e.status === 403) {
      redirect("/login"); // 인증됐으나 출력 VIEW 미달(예외) → 로그인.
    }
    redirect("/login"); // 비인증.
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="대시보드 개요" subtitle="물류·매장·상품 핵심 요약과 경보" periodLocked />
      <HomeView />
    </div>
  );
}
