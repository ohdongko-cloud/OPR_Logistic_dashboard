"use client";

import { useEffect, useState } from "react";

/**
 * 관리자 — 시스템 상태 패널(ADMIN 전용).
 *
 * 표시(작업지시 ②):
 *   - DB·인증 구성 여부(/api/health — boolean 만, 시크릿 미노출)
 *   - 사용자 수 · 활성 수(/api/admin/users 재사용 — 계정 메타만)
 *   - 마지막 적재 시각(/api/snapshots 최신 CURRENT uploadedAt)
 *
 * 신규 API 없음 — 기존 엔드포인트 재사용(중복 생성 금지). 모두 graceful.
 */

interface Health {
  config: { database: boolean; auth: boolean };
  time: string;
}

interface SnapRow {
  status: string;
  uploadedAt: string;
}

export function AdminSystem() {
  const [health, setHealth] = useState<Health | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [userActive, setUserActive] = useState<number | null>(null);
  const [lastLoad, setLastLoad] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const [h, u, s] = await Promise.all([
          fetch("/api/health", { cache: "no-store", signal: ac.signal })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/admin/users", { cache: "no-store", signal: ac.signal })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/snapshots", { cache: "no-store", signal: ac.signal })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (h?.config) setHealth({ config: h.config, time: h.time });
        if (u?.ok) {
          const users = (u.users ?? []) as { active: boolean }[];
          setUserTotal(users.length);
          setUserActive(users.filter((x) => x.active).length);
          setDbReady(Boolean(u.dbReady));
        }
        if (s?.ok) {
          const current = (s.snapshots ?? []) as SnapRow[];
          const latest = current
            .filter((r) => r.status === "CURRENT")
            .map((r) => r.uploadedAt)
            .sort()
            .at(-1);
          setLastLoad(latest ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-400">시스템 상태 불러오는 중…</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="데이터베이스"
        value={health?.config.database ? "구성됨" : "미구성"}
        ok={health?.config.database}
      />
      <StatCard
        label="인증(Auth)"
        value={health?.config.auth ? "구성됨" : "미구성"}
        ok={health?.config.auth}
      />
      <StatCard
        label="사용자"
        value={
          userTotal == null
            ? "—"
            : `${userTotal.toLocaleString("ko-KR")}명 (활성 ${userActive ?? 0})`
        }
        ok={dbReady ?? undefined}
      />
      <StatCard
        label="마지막 적재"
        value={lastLoad ? fmtDateTime(lastLoad) : dbReady ? "이력 없음" : "—"}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        {ok !== undefined && (
          <span
            className={[
              "inline-block h-2 w-2 rounded-full",
              ok ? "bg-green-500" : "bg-zinc-300",
            ].join(" ")}
            aria-hidden
          />
        )}
        <span className="text-[11px] text-zinc-400">{label}</span>
      </div>
      <div className="mt-1 text-[13px] font-medium text-zinc-800">{value}</div>
    </div>
  );
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}
