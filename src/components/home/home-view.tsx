"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fmtDays, fmtEok, fmtMult, fmtPct, fmtQty } from "@/lib/format";
import { type HomeResponse, type HomeSnapshotMeta } from "@/app/api/home/route";
import { type HomeAlert, type OverviewKpi } from "@/lib/home/overview";

/**
 * 대시보드 홈(개요) — 레퍼런스 BI 양식.
 *
 * 구성(작업지시 ①):
 *   - 요약 KPI(3영역 핵심) — /api/home.kpis
 *   - 경보 카드(악성 체화·(−)재고·고물류비율·목표 미달) 상위 N — 클릭 시 해당 뷰로 점프
 *   - 최근 데이터 현황(CURRENT 스냅샷 메타)
 *   - 퀵링크(3뷰 + 업로드 + 입력면 + 관리자[권한자만])
 * 데이터 없거나 권한 제한 시 graceful(빈 상태 안내). 가짜값 금지.
 */

interface MeCaps {
  role: string | null;
  canInput: boolean;
  canUpload: boolean;
  isAdmin: boolean;
}

const FILE_TYPE_LABEL: Record<string, string> = {
  ITEM: "아이템(물류 핵심지표)",
  STORE: "매장 SCM",
  PRODUCT: "상품 SCM",
};

export function HomeView() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [caps, setCaps] = useState<MeCaps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [homeRes, meRes] = await Promise.all([
          fetch("/api/home", { cache: "no-store", signal: ac.signal }),
          fetch("/api/me", { cache: "no-store", signal: ac.signal }),
        ]);
        const homeJson = await homeRes.json().catch(() => ({ ok: false }));
        if (!homeRes.ok || !homeJson.ok) {
          setError(homeJson.detail ?? "개요 데이터를 불러올 수 없습니다.");
        } else {
          setData(homeJson as HomeResponse);
        }
        const meJson = await meRes.json().catch(() => null);
        if (meJson?.ok) {
          setCaps({
            role: meJson.role ?? null,
            canInput: Boolean(meJson.canInput),
            canUpload: Boolean(meJson.canUpload),
            isAdmin: meJson.role === "ADMIN",
          });
        }
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setError("개요 조회 중 네트워크 오류가 발생했습니다.");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-sm text-zinc-400">개요 로딩 중…</div>;
  }

  const noData = !data || (!data.engineReady && !data.storeReady);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {error}
        </p>
      )}

      {/* 데이터 가용 안내(빈 상태) */}
      {noData && !error && (
        <div className="mb-5 rounded-lg border border-dashed border-zinc-300 bg-white px-5 py-6 text-center">
          <p className="text-[14px] font-medium text-zinc-700">표시할 실적 데이터가 없습니다.</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            백데이터를 업로드하면 요약 지표·경보가 채워집니다.
          </p>
          {caps?.canUpload && (
            <Link
              href="/upload"
              className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              데이터 업로드로 이동
            </Link>
          )}
        </div>
      )}

      {/* 요약 KPI */}
      {data && data.kpis.length > 0 && <KpiSummary kpis={data.kpis} />}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 경보 카드 — 좌측 2/3 */}
        <section className="lg:col-span-2">
          <SectionTitle>경보 — 의사결정 직결 상위 항목</SectionTitle>
          {data && data.alerts.length > 0 ? (
            <ul className="space-y-2">
              {data.alerts.map((a, i) => (
                <AlertCard key={`${a.kind}-${i}`} alert={a} />
              ))}
            </ul>
          ) : (
            <EmptyHint>
              {data?.sparse
                ? "임계 초과 항목이 없습니다 — 현재 위험 신호 없음(또는 데이터 희소)."
                : "표시할 경보가 없습니다."}
            </EmptyHint>
          )}
        </section>

        {/* 우측 1/3: 최근 데이터 현황 + 퀵링크 */}
        <aside className="space-y-5">
          <section>
            <SectionTitle>최근 데이터 현황</SectionTitle>
            <RecentData snapshots={data?.currentSnapshots ?? []} dbReady={data?.dbReady ?? false} />
          </section>

          <section>
            <SectionTitle>바로가기</SectionTitle>
            <QuickLinks caps={caps} />
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── 요약 KPI ──────────────────────────────────────────────────────────────

function KpiSummary({ kpis }: { kpis: OverviewKpi[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-x-7 gap-y-3 rounded-lg border border-zinc-200 bg-white px-5 py-4">
      {kpis.map((k) => (
        <KpiCell key={k.id} kpi={k} />
      ))}
    </div>
  );
}

function fmtKpi(k: OverviewKpi): string {
  if (k.suppressed || k.value == null) return "—";
  switch (k.format) {
    case "pct":
      return fmtPct(k.value);
    case "days":
      return fmtDays(k.value);
    case "eok":
      return fmtEok(k.value);
    case "qty":
      return fmtQty(k.value);
    case "mult":
      return fmtMult(k.value);
    default:
      return String(k.value);
  }
}

function KpiCell({ kpi }: { kpi: OverviewKpi }) {
  const text = fmtKpi(kpi);
  return (
    <div className="flex min-w-[96px] flex-col justify-center">
      <span className="text-[11px] leading-tight text-zinc-400">{kpi.label}</span>
      <span
        className={[
          "tabnum mt-0.5 text-[22px] font-semibold leading-none",
          kpi.suppressed
            ? "cursor-help text-zinc-300"
            : kpi.warn
              ? "text-bad"
              : "text-zinc-800",
        ].join(" ")}
        title={kpi.suppressed ? kpi.reason : undefined}
      >
        {text}
        {kpi.warn && !kpi.suppressed && <span className="ml-1 align-top text-[12px]">⚠</span>}
      </span>
    </div>
  );
}

// ── 경보 카드 ──────────────────────────────────────────────────────────────

const ALERT_ICON: Record<HomeAlert["kind"], string> = {
  DEAD_STOCK: "■",
  HIGH_RATIO: "▲",
  NEG_STOCK: "−",
  TARGET_MISS: "◎",
};

function AlertCard({ alert }: { alert: HomeAlert }) {
  const high = alert.severity === "high";
  return (
    <li>
      <Link
        href={alert.href}
        className={[
          "flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-colors hover:bg-zinc-50",
          high ? "border-red-200" : "border-amber-200",
        ].join(" ")}
      >
        <span
          className={[
            "grid h-8 w-8 shrink-0 place-items-center rounded-md text-[14px] font-bold",
            high ? "bg-red-50 text-bad" : "bg-amber-50 text-amber-600",
          ].join(" ")}
          aria-hidden
        >
          {ALERT_ICON[alert.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-800">{alert.title}</span>
            <span
              className={[
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                high ? "bg-red-50 text-bad" : "bg-amber-50 text-amber-600",
              ].join(" ")}
            >
              {high ? "주의" : "관찰"}
            </span>
            <span className="truncate text-[12px] text-zinc-500">{alert.subject}</span>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">{alert.detail}</p>
        </div>
        <span className="shrink-0 text-[11px] text-zinc-300">상세 →</span>
      </Link>
    </li>
  );
}

// ── 최근 데이터 현황 ─────────────────────────────────────────────────────────

function fmtAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

function RecentData({
  snapshots,
  dbReady,
}: {
  snapshots: HomeSnapshotMeta[];
  dbReady: boolean;
}) {
  if (!dbReady) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-[12px] text-zinc-500">
        DB 미구성 — 적재 이력을 표시할 수 없습니다(라이브파일 폴백 동작 중일 수 있음).
      </div>
    );
  }
  if (snapshots.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-[12px] text-zinc-500">
        CURRENT 스냅샷이 없습니다 — 아직 업로드된 백데이터가 없습니다.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {snapshots.map((s) => (
        <li
          key={s.id}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-zinc-800">
              {FILE_TYPE_LABEL[s.fileType] ?? s.fileType}
            </span>
            <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
              CURRENT
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              {s.periodType === "CUMULATIVE" ? "누적" : "당월"} · {s.periodStart} ~ {s.periodEnd}
            </span>
            <span className="tabnum">{s.factRows.toLocaleString("ko-KR")} fact</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-zinc-400">
            {s.uploadedBy ?? "—"} · {fmtAgo(s.uploadedAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── 퀵링크 ────────────────────────────────────────────────────────────────

function QuickLinks({ caps }: { caps: MeCaps | null }) {
  const links: { href: string; label: string; desc: string; show: boolean }[] = [
    { href: "/engine", label: "물류 핵심지표", desc: "시즌·아이템 드릴다운", show: true },
    { href: "/store", label: "매장 SCM", desc: "채널·점포 분석", show: true },
    { href: "/product", label: "상품 SCM", desc: "상품 단위 SCM", show: true },
    { href: "/upload", label: "데이터 업로드", desc: "백데이터 적재", show: Boolean(caps?.canUpload) },
    { href: "/input", label: "입력면", desc: "물류비예측·목표 입력", show: Boolean(caps?.canInput) },
    { href: "/admin", label: "관리자", desc: "사용자·권한·데이터", show: Boolean(caps?.isAdmin) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {links
        .filter((l) => l.show)
        .map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <div className="text-[12.5px] font-medium text-zinc-800">{l.label}</div>
            <div className="mt-0.5 text-[10.5px] text-zinc-400">{l.desc}</div>
          </Link>
        ))}
    </div>
  );
}

// ── 공통 ──────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </h2>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-[12px] text-zinc-400">
      {children}
    </div>
  );
}
