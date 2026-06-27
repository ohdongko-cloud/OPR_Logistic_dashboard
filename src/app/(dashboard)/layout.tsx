import { Sidebar } from "@/components/shell/sidebar";

/**
 * 대시보드 공통 레이아웃 (레퍼런스 BI 양식 — 좌측 사이드바 + 메인영역).
 *
 * 좌측: 고정 사이드바(로고·내비·사용자 카드).
 * 우측: 메인영역(각 페이지가 자체 Topbar = 타이틀·기간칩·로그아웃을 렌더).
 *
 * 세션 user 는 사이드바 사용자 카드에 표시. providers 미구성 단계에선 게스트로 폴백.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await safeUser();

  return (
    // 뷰포트 고정 셸 — 사이드바·탑바 고정, 메인 콘텐츠(요약+테이블)만 통째로 세로 스크롤.
    // (UI 피드백 ③: 상세 테이블 답답함 해소 — 각 뷰의 콘텐츠 div 가 단일 자연 스크롤 소유.)
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">{children}</div>
    </div>
  );
}

/** 세션 조회 — provider 미구성/에러 시 null(게스트)로 안전 폴백. */
async function safeUser(): Promise<{
  name?: string | null;
  email?: string | null;
  role?: string | null;
} | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    return (session?.user as { name?: string | null; email?: string | null; role?: string | null }) ?? null;
  } catch {
    return null;
  }
}
