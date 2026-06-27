"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { useDialog } from "@/components/shared/use-dialog";

/**
 * 스냅샷 이력 목록 — fileType·period별 CURRENT/SUPERSEDED·업로더·시각·fact수.
 *
 * 근거: GET /api/snapshots(logistics VIEW). 업로드 직후 refreshKey 변경으로 재조회.
 *   메타만 표시(실수치 미포함).
 *
 * C11 롤백: SUPERSEDED 행에 "복원" 버튼(확인 다이얼로그) → POST /api/snapshots/[id]/restore.
 *   입력(업로드) 권한자(input MANAGE)만 노출 — 서버 게이트와 동일. 성공 시 이력·대시보드 재조회.
 */

interface SnapRow {
  id: string;
  fileType: "ITEM" | "STORE" | "PRODUCT";
  periodType: "MONTH" | "CUMULATIVE";
  periodStart: string;
  periodEnd: string;
  status: "CURRENT" | "SUPERSEDED" | "PROCESSING" | "FAILED";
  uploadedAt: string;
  rowCount: number;
  uploadedBy: string | null;
  factRows: number;
}

const FILE_TYPE_LABEL: Record<string, string> = {
  ITEM: "아이템",
  STORE: "매장",
  PRODUCT: "상품",
};

const STATUS_STYLE: Record<string, string> = {
  CURRENT: "bg-green-50 text-green-700",
  SUPERSEDED: "bg-zinc-100 text-zinc-500",
  PROCESSING: "bg-blue-50 text-blue-600",
  FAILED: "bg-red-50 text-red-600",
};

function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

interface SnapshotHistoryProps {
  refreshKey?: number;
  /** 복원 성공 시 부모에 통지(대시보드 재조회 트리거용). */
  onRestored?: () => void;
}

export function SnapshotHistory({ refreshKey = 0, onRestored }: SnapshotHistoryProps) {
  const [rows, setRows] = useState<SnapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"ALL" | "ITEM" | "STORE" | "PRODUCT">("ALL");
  // 입력(업로드 MANAGE) 권한자만 복원 버튼 노출 — 서버 게이트(input MANAGE)와 동일.
  const [canRestore, setCanRestore] = useState(false);
  // 복원 확인 대상(다이얼로그).
  const [confirmRow, setConfirmRow] = useState<SnapRow | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const load = useCallback(async (ft: typeof filterType) => {
    setErr(null);
    try {
      const qs = ft === "ALL" ? "" : `?file_type=${ft}`;
      const res = await fetch(`/api/snapshots${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json.ok) {
        setErr(json.detail ?? "이력을 불러올 수 없습니다.");
        setRows([]);
      } else {
        setRows(json.snapshots ?? []);
      }
    } catch {
      setErr("이력 조회 네트워크 오류");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 마운트/필터/새로고침 시 비동기 로드(effect 본문에서 동기 setState 안 함).
    let active = true;
    void (async () => {
      if (active) await load(filterType);
    })();
    return () => {
      active = false;
    };
  }, [load, filterType, refreshKey]);

  // 복원 권한(canUpload = input MANAGE) 1회 조회 — UI 게이트(실제 강제는 서버 guardTab).
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/me", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCanRestore(Boolean(j?.canUpload)))
      .catch(() => setCanRestore(false));
    return () => ac.abort();
  }, []);

  const doRestore = useCallback(
    async (row: SnapRow) => {
      setRestoring(true);
      setRestoreMsg(null);
      try {
        const res = await fetch(`/api/snapshots/${encodeURIComponent(row.id)}/restore`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({ ok: false }));
        if (res.status === 403) {
          setErr("복원 권한이 없습니다(입력 MANAGE 필요).");
        } else if (!res.ok || !json.ok) {
          setErr(json.detail ?? "복원에 실패했습니다.");
        } else {
          setRestoreMsg(json.detail ?? "복원되었습니다.");
          setErr(null);
          await load(filterType); // 이력 재조회(상태 전환 반영).
          onRestored?.(); // 대시보드 재조회 트리거.
        }
      } catch {
        setErr("복원 중 네트워크 오류");
      } finally {
        setRestoring(false);
        setConfirmRow(null);
      }
    },
    [load, filterType, onRestored],
  );

  return (
    <div className="max-w-[760px] rounded-lg border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-zinc-800">스냅샷 이력</h3>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="rounded border border-zinc-300 px-2 py-1 text-[11px]"
          >
            <option value="ALL">전체</option>
            <option value="ITEM">아이템</option>
            <option value="STORE">매장</option>
            <option value="PRODUCT">상품</option>
          </select>
          <button
            type="button"
            onClick={() => load(filterType)}
            className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {err && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {err}
        </p>
      )}
      {restoreMsg && (
        <p className="mt-1 rounded border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">
          {restoreMsg}
        </p>
      )}

      {loading ? (
        <p className="py-4 text-center text-[12px] text-zinc-400">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-zinc-400">스냅샷 이력이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">종류</th>
                <th className="px-3 py-1.5 text-left font-medium">기간</th>
                <th className="px-3 py-1.5 text-left font-medium">귀속</th>
                <th className="px-3 py-1.5 text-left font-medium">상태</th>
                <th className="px-3 py-1.5 text-right font-medium">fact수</th>
                <th className="px-3 py-1.5 text-left font-medium">업로더</th>
                <th className="px-3 py-1.5 text-left font-medium">업로드 시각</th>
                {canRestore && <th className="px-3 py-1.5 text-right font-medium">롤백</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-1.5 text-zinc-700">
                    {FILE_TYPE_LABEL[r.fileType] ?? r.fileType}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-600">
                    {r.periodType === "CUMULATIVE" ? "누적" : "당월"}
                  </td>
                  <td className="px-3 py-1.5 text-[10.5px] text-zinc-500">
                    {fmtDate(r.periodStart)} ~ {fmtDate(r.periodEnd)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[10px]",
                        STATUS_STYLE[r.status] ?? "bg-zinc-100 text-zinc-500",
                      ].join(" ")}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="tabnum px-3 py-1.5 text-right text-zinc-700">
                    {r.factRows.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-1.5 text-[10.5px] text-zinc-500">{r.uploadedBy ?? "—"}</td>
                  <td className="px-3 py-1.5 text-[10.5px] text-zinc-500">
                    {fmtDateTime(r.uploadedAt)}
                  </td>
                  {canRestore && (
                    <td className="px-3 py-1.5 text-right">
                      {r.status === "SUPERSEDED" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRestoreMsg(null);
                            setConfirmRow(r);
                          }}
                          className="rounded border border-accent/40 px-2 py-0.5 text-[10.5px] text-accent hover:bg-accent/5"
                        >
                          복원
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-zinc-400">
        멱등 적재 — 같은 종류·기간 재업로드 시 이전 CURRENT 가 SUPERSEDED 로 보존됩니다(이력 삭제 없음).
        {canRestore && " 잘못 올린 경우 SUPERSEDED 행을 복원해 이전 CURRENT 로 되돌릴 수 있습니다."}
      </p>

      {confirmRow && (
        <RestoreConfirmDialog
          row={confirmRow}
          busy={restoring}
          onConfirm={() => doRestore(confirmRow)}
          onCancel={() => setConfirmRow(null)}
        />
      )}
    </div>
  );
}

/** 복원 확인 다이얼로그 — useDialog(ESC·포커스 트랩·dialog 시맨틱) 재사용. */
function RestoreConfirmDialog({
  row,
  busy,
  onConfirm,
  onCancel,
}: {
  row: SnapRow;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { ref, titleId, dialogProps } = useDialog(true, onCancel);
  const descId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={ref}
        {...dialogProps}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-[400px] rounded-lg border border-zinc-200 bg-white p-5 shadow-xl outline-none"
      >
        <h2 id={titleId} className="text-[14px] font-semibold text-zinc-800">
          스냅샷 복원
        </h2>
        <p id={descId} className="mt-2 text-[12px] text-zinc-600">
          이 {FILE_TYPE_LABEL[row.fileType] ?? row.fileType} ·{" "}
          {row.periodType === "CUMULATIVE" ? "누적" : "당월"} 스냅샷(
          {fmtDate(row.periodStart)} ~ {fmtDate(row.periodEnd)})을 현재(CURRENT)로 되돌립니다.
          현재 CURRENT 는 SUPERSEDED 로 강등되며 이력은 보존됩니다.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-[12px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "복원 중…" : "복원"}
          </button>
        </div>
      </div>
    </div>
  );
}
