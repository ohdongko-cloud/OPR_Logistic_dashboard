/**
 * 화면 스텁 — 골격 단계의 빈 뷰 자리.
 * 실제 위젯(KPI 카드·드릴다운 테이블·차트)은 아키텍처 확정 후 다음 단계 구현.
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
    <section className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>

      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6">
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
  );
}
