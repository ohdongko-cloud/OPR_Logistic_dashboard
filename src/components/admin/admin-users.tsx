"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 관리자 사용자·권한 표 (ADMIN 전용 UI).
 *
 * - 사용자 목록(GET /api/admin/users)
 * - role 변경 · active 토글 · 탭별 권한(VIEW/INPUT/MANAGE/없음) 설정
 *   → PATCH /api/admin/perms. 성공 시 목록 재조회(낙관적 갱신 대신 단순 refetch).
 */

const TABS = ["logistics", "store", "product", "input", "admin"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  logistics: "물류①",
  store: "매장②",
  product: "상품③",
  input: "입력면",
  admin: "관리",
};
const LEVELS = ["VIEW", "INPUT", "MANAGE"] as const;
const ROLES = ["ADMIN", "STAFF", "VIEWER"] as const;

type Perm = { tab: string; level: string };
type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  createdAt: string;
  perms: Perm[];
};

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.detail ?? "사용자 목록을 불러오지 못했습니다.");
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 마운트 후 비동기 로드(effect 본문에서 동기 setState 안 함).
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function patch(body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/perms", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.detail ?? "변경에 실패했습니다.");
        return;
      }
      await load();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function levelOf(u: User, tab: string): string {
    return u.perms.find((p) => p.tab === tab)?.level ?? "";
  }

  if (loading) {
    return <div className="text-sm text-zinc-400">불러오는 중…</div>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-grid-head text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">이메일</th>
              <th className="px-3 py-2 font-medium">역할</th>
              <th className="px-3 py-2 font-medium">활성</th>
              {TABS.map((t) => (
                <th key={t} className="px-3 py-2 text-center font-medium">
                  {TAB_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-grid-line hover:bg-grid-hover">
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-800">{u.email}</div>
                  {u.name && <div className="text-xs text-zinc-400">{u.name}</div>}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    disabled={busy !== null}
                    onChange={(e) =>
                      patch(
                        { action: "role", userId: u.id, role: e.target.value },
                        `role-${u.id}`,
                      )
                    }
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    disabled={busy !== null}
                    onClick={() =>
                      patch(
                        { action: "active", userId: u.id, active: !u.active },
                        `active-${u.id}`,
                      )
                    }
                    className={[
                      "rounded px-2 py-1 text-xs font-medium",
                      u.active
                        ? "bg-green-50 text-green-700"
                        : "bg-zinc-100 text-zinc-500",
                    ].join(" ")}
                  >
                    {u.active ? "활성" : "비활성"}
                  </button>
                </td>
                {TABS.map((t) => {
                  const isAdminRole = u.role === "ADMIN";
                  return (
                    <td key={t} className="px-3 py-2 text-center">
                      <select
                        value={isAdminRole ? "MANAGE" : levelOf(u, t)}
                        disabled={busy !== null || isAdminRole}
                        title={isAdminRole ? "ADMIN = 전 탭 MANAGE 암묵" : undefined}
                        onChange={(e) =>
                          patch(
                            {
                              action: "tab",
                              userId: u.id,
                              tab: t,
                              level: e.target.value === "" ? null : e.target.value,
                            },
                            `tab-${u.id}-${t}`,
                          )
                        }
                        className="rounded border border-zinc-300 px-1.5 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="">없음</option>
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3 + TABS.length} className="px-3 py-6 text-center text-zinc-400">
                  사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">
        ※ ADMIN 역할은 전 탭 MANAGE 권한이 암묵 부여됩니다. 입력/관리 권한은 명시 부여가 필요합니다.
      </p>
    </div>
  );
}
