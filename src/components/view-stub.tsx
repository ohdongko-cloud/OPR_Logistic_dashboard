import { Suspense } from "react";

import { Topbar } from "@/components/shell/topbar";

/**
 * 화면 스텁 — 골격 단계의 빈 뷰 자리.
 * 실제 위젯(KPI 카드·드릴다운 테이블·차트)은 아키텍처 확정 후 다음 단계 구현.
 * 레퍼런스 BI 셸과 동일하게 Topbar(타이틀·기간칩·로그아웃)를 얹는다.
 */
export function ViewStub({
  title,
  subtitle,
  source,
  planned,
}: {
  title: string;
  subtitle: string;
  source: string;
  planned: string[];
}) {
  return (
    <>
      <Suspense fallback={<div className="h-[57px] border-b border-zinc-200 bg-white" />}>
        <Topbar title={title} subtitle={subtitle} />
      </Suspense>
      <section className="flex-1 overflow-auto p-5">
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6">
        <p className="text-sm font-medium text-zinc-500">
          🏗 골격(스텁) — 본문 위젯 미구현
        </p>
        <p className="mt-2 text-xs text-zinc-500">출처: {source}</p>
        <p className="mt-4 text-xs font-medium text-zinc-500">
          다음 단계 구현 예정:
        </p>
        <ul className="mt-1 list-inside list-disc text-xs text-zinc-600">
          {planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        </div>
      </section>
    </>
  );
}
