"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * 물류비예측 월입력 폼 — 7대 비용총액(수기).
 *
 * 근거: src/lib/engine/logi-cost.ts LogiCostTotals(7종) · 작업지시 4번(물류비예측 월입력).
 *
 * 저장 = POST /api/annotations (kind=LOGI_COST, metricCode=비용항목키, numValue=금액).
 *   → 향후 엔진이 ‘물류비예측’ RAW 미업로드 시 이 수기값을 물류비 입력원으로 사용.
 *
 * ⚠️ TODO(fast-follow): 현재는 입력·저장만(annotation 적재). 엔진 TRANSFORM 이
 *   LOGI_COST annotation 을 RAW 폴백 입력원으로 흡수하는 연동은 미구현(자리만).
 *   (시간 촉박 시 자리+TODO 명시 — 작업지시 4번 단서.)
 */

const COST_ITEMS: { key: string; label: string; hint: string }[] = [
  { key: "rent", label: "임차료(임차+관리비)", hint: "BI8" },
  { key: "receive", label: "수도광열비(수광비)", hint: "BK8" },
  { key: "staff", label: "정직원 인건비", hint: "BR8" },
  { key: "outsource", label: "도급비", hint: "BP8" },
  { key: "freight", label: "운반비(배송비)", hint: "BT8" },
  { key: "box", label: "박스비(포장비)", hint: "BX8" },
  { key: "material", label: "부자재비(기타)", hint: "BZ8" },
];

function todayMonthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function LogiCostForm() {
  const [periodType, setPeriodType] = useState<"MONTH" | "CUMULATIVE">("MONTH");
  const [periodStart, setPeriodStart] = useState(todayMonthStart());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const total = useMemo(
    () =>
      COST_ITEMS.reduce((s, it) => {
        const v = Number(values[it.key]);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0),
    [values],
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const toPost = COST_ITEMS.map((it) => ({ key: it.key, label: it.label, raw: values[it.key] })).filter(
      (e) => e.raw != null && e.raw.trim() !== "" && Number.isFinite(Number(e.raw)),
    );
    if (toPost.length === 0) {
      setErr("입력된 비용이 없습니다.");
      setSaving(false);
      return;
    }

    // C13: 단일 배치 요청 — 7대 비용을 한 트랜잭션으로 원자 저장(부분저장 불가).
    const items = toPost.map((e) => ({
      kind: "LOGI_COST" as const,
      periodType,
      periodStart,
      key: { gender: "", newcarry: "", season: "", item: "" },
      metricCode: e.key,
      numValue: Number(e.raw),
    }));

    try {
      const r = await fetch("/api/annotations/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403) {
        setErr("입력 권한이 없습니다(INPUT 필요).");
      } else if (!r.ok || !j.ok) {
        // 원자성: 실패 = 무반영.
        setErr(`저장 실패: ${j.detail ?? "알 수 없는 오류"}`);
      } else {
        setMsg(`물류비예측이 저장되었습니다(${j.count ?? items.length}건).`);
      }
    } catch {
      setErr("네트워크 오류로 저장하지 못했습니다(반영되지 않았습니다).");
    } finally {
      setSaving(false);
    }
  }, [values, periodType, periodStart]);

  return (
    <div className="max-w-[640px] rounded-lg border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-zinc-800">물류비예측 월입력 (7대 비용)</h2>
        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10.5px] text-amber-700">
          fast-follow: 엔진 입력원 연동 TODO
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="text-[10px] text-zinc-400">기간 유형</span>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as "MONTH" | "CUMULATIVE")}
            className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
          >
            <option value="MONTH">당월</option>
            <option value="CUMULATIVE">누적</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] text-zinc-400">귀속 월(시작일)</span>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
          />
        </label>
      </div>

      <div className="space-y-2">
        {COST_ITEMS.map((it) => (
          <div key={it.key} className="flex items-center gap-3">
            <label className="w-44 text-[12px] text-zinc-700">{it.label}</label>
            <input
              inputMode="decimal"
              value={values[it.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [it.key]: e.target.value }))}
              placeholder="원(원단위)"
              className="tabnum flex-1 rounded border border-zinc-300 px-2 py-1 text-right text-[12px] focus:border-accent focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 text-[12px]">
        <span className="text-zinc-500">물류비 총액(합계)</span>
        <span className="tabnum font-semibold text-zinc-800">
          {Math.round(total).toLocaleString("ko-KR")} 원
        </span>
      </div>

      {err && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{err}</p>
      )}
      {msg && (
        <p className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">{msg}</p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
