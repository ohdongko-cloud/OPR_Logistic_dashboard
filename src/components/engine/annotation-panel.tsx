"use client";

import { useCallback, useMemo, useState } from "react";

import {
  TARGET_METRICS,
  TARGET_METRIC_FORMAT,
  TARGET_METRIC_LABEL,
  type AnnotationDto,
  type NodeKey,
  type TargetMetric,
} from "@/lib/annotations";
import { serializeNodeKey } from "@/lib/annotations/node-key";
import { type FactKey, type FactRow } from "@/lib/engine";
import { useDialog } from "@/components/shared/use-dialog";

/**
 * 입력면 패널 — 선택 노드의 목표·전년(수기)·비고·조치 CRUD.
 *
 * INPUT 권한자(물류본부장/admin)만 진입(canInput). 저장 = POST /api/annotations.
 * 출력면(엔진 집계)은 불변 — 이 패널은 별도 입력 레이어(Annotation)만 쓴다.
 *
 * 목표/전년은 지표코드별 수치 입력. 현재값(metrics)을 옆에 보여 즉시 비교감.
 *
 * 구현: 폼 초기값은 PanelBody 의 useState 초기화로 props 에서 파생(setState-in-effect 회피).
 *   노드 변경 시 wrapper 가 key 를 바꿔 PanelBody 를 remount → 초기값 재계산.
 */

interface PanelProps {
  open: boolean;
  /** 편집 대상 노드 키(4키). */
  nodeKey: FactKey | null;
  nodeLabel: string;
  /** 노드 현재 집계값(비교 표시용). */
  metrics: FactRow | null;
  periodType: "MONTH" | "CUMULATIVE";
  /** 이 노드의 기존 주석(GET 응답에서 필터). */
  existing: AnnotationDto[];
  /** 이 노드 전년 자동값(이력 조인). */
  autoPriorYear: Partial<Record<TargetMetric, number>>;
  /** 저장/삭제 후 부모가 재조회. */
  onSaved: () => void;
  onClose: () => void;
}

type FormState = {
  targets: Record<string, string>;
  priorYear: Record<string, string>;
  remark: string;
  action: string;
};

/** 기존 주석 목록 → 폼 초기값(파생). */
function formFromExisting(existing: AnnotationDto[]): FormState {
  const f: FormState = { targets: {}, priorYear: {}, remark: "", action: "" };
  for (const a of existing) {
    if (a.kind === "TARGET" && a.metricCode && a.numValue != null) {
      f.targets[a.metricCode] = String(a.numValue);
    } else if (a.kind === "PRIOR_YEAR" && a.metricCode && a.numValue != null) {
      f.priorYear[a.metricCode] = String(a.numValue);
    } else if (a.kind === "REMARK") {
      f.remark = a.textValue ?? "";
    } else if (a.kind === "ACTION") {
      f.action = a.textValue ?? "";
    }
  }
  return f;
}

/** 표시용 입력 힌트(%·일·억·량). */
function unitHint(m: TargetMetric): string {
  switch (TARGET_METRIC_FORMAT[m]) {
    case "pct":
      return "비율(0~1, 예 0.12 = 12%)";
    case "days":
      return "일수";
    case "eok":
      return "원(원단위 금액)";
    default:
      return "수량(PCS)";
  }
}

function fmtCurrent(m: TargetMetric, v: number | null | undefined): string {
  if (v == null) return "-";
  switch (TARGET_METRIC_FORMAT[m]) {
    case "pct":
      return `${(v * 100).toFixed(1)}%`;
    case "days":
      return `${Math.round(v)}일`;
    case "eok":
      return `${(v / 1e8).toFixed(1)}억`;
    default:
      return Math.round(v).toLocaleString("ko-KR");
  }
}

/** 얇은 게이트 — open·nodeKey 없으면 미렌더. 노드별 key 로 본문 remount(초기값 재계산). */
export function AnnotationPanel(props: PanelProps) {
  if (!props.open || !props.nodeKey) return null;
  const keyStr = serializeNodeKey({
    gender: props.nodeKey.gender ?? "",
    newcarry: props.nodeKey.newcarry ?? "",
    season: props.nodeKey.season ?? "",
    item: props.nodeKey.item ?? "",
  });
  return <PanelBody key={keyStr} {...props} nodeKey={props.nodeKey} />;
}

function PanelBody({
  nodeKey,
  nodeLabel,
  metrics,
  periodType,
  existing,
  autoPriorYear,
  onSaved,
  onClose,
}: PanelProps & { nodeKey: FactKey }) {
  const [form, setForm] = useState<FormState>(() => formFromExisting(existing));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 접근성: PanelBody 는 열린 상태에서만 마운트 → useDialog(true) 로 ESC·트랩·포커스 관리.
  const { ref: dialogRef, titleId, dialogProps } = useDialog(true, onClose);

  const periodStart = useMemo(() => {
    // 본문엔 당월 1일 ISO. 서버 upsert 는 본문 periodStart 를 grain 키로 일관 사용.
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  /** 단건 저장 — 성공/실패+사유를 반환(setErr 덮어쓰기 대신 호출부가 집계). */
  const post = useCallback(
    async (label: string, body: unknown): Promise<{ ok: boolean; reason?: string }> => {
      try {
        const r = await fetch("/api/annotations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.status === 403) return { ok: false, reason: `${label}: 입력 권한 없음(INPUT 필요)` };
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) return { ok: false, reason: `${label}: ${j.detail ?? "저장 실패"}` };
        return { ok: true };
      } catch {
        return { ok: false, reason: `${label}: 네트워크 오류` };
      }
    },
    [],
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    setWarn(null);
    const key: NodeKey = {
      gender: nodeKey.gender ?? "",
      newcarry: nodeKey.newcarry ?? "",
      season: nodeKey.season ?? "",
      item: nodeKey.item ?? "",
    };
    const base = { periodType, periodStart, key };

    const reqs: Promise<{ ok: boolean; reason?: string }>[] = [];
    for (const [code, raw] of Object.entries(form.targets)) {
      const v = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(v)) {
        reqs.push(post(`목표(${code})`, { ...base, kind: "TARGET", metricCode: code, numValue: v }));
      }
    }
    for (const [code, raw] of Object.entries(form.priorYear)) {
      const v = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(v)) {
        reqs.push(post(`전년(${code})`, { ...base, kind: "PRIOR_YEAR", metricCode: code, numValue: v }));
      }
    }
    if (form.remark.trim()) reqs.push(post("비고", { ...base, kind: "REMARK", textValue: form.remark.trim() }));
    if (form.action.trim()) reqs.push(post("조치", { ...base, kind: "ACTION", textValue: form.action.trim() }));

    if (reqs.length === 0) {
      setErr("입력된 값이 없습니다.");
      setSaving(false);
      return;
    }
    const results = await Promise.all(reqs);
    setSaving(false);

    const total = results.length;
    const okN = results.filter((r) => r.ok).length;
    const reasons = results.filter((r) => !r.ok && r.reason).map((r) => r.reason!);

    // 부분성공 인지: 성공분이 있으면 항상 재조회(서버 반영분 동기화).
    if (okN > 0) onSaved();

    if (okN === total) {
      setMsg(`저장되었습니다(${okN}건).`);
    } else if (okN > 0) {
      // 부분성공 — 성공분은 반영(onSaved 호출됨), 실패분 사유 명시.
      setWarn(`${okN}/${total}건 저장됨 · 일부 실패: ${reasons.join(" / ")}`);
    } else {
      setErr(`저장 실패: ${reasons.join(" / ") || "알 수 없는 오류"}`);
    }
  }, [nodeKey, form, periodType, periodStart, post, onSaved]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="flex-1 bg-black/20" />
      <div
        ref={dialogRef}
        {...dialogProps}
        className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-xl outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3.5">
          <div>
            <h2 id={titleId} className="text-[14px] font-semibold text-zinc-800">입력면 — 목표·전년·비고</h2>
            <p className="text-[11px] text-zinc-400">
              {nodeLabel || "전체 (OPR)"} · {periodType === "CUMULATIVE" ? "누적" : "당월"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-zinc-700">목표 / 전년 (수기)</h3>
            <p className="mb-2 text-[11px] text-zinc-400">
              전년값은 누적 이력이 있으면 자동 계산됩니다. 아래 입력 시 수기값이 우선합니다.
            </p>
            <div className="space-y-2.5">
              {TARGET_METRICS.map((m) => {
                const cur = metrics?.[m] ?? null;
                const auto = autoPriorYear[m];
                return (
                  <div key={m} className="rounded-md border border-zinc-200 p-2.5">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[12px] font-medium text-zinc-700">
                        {TARGET_METRIC_LABEL[m]}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        현재 {fmtCurrent(m, cur)}
                        {auto != null && (
                          <span className="ml-1 text-zinc-400">· 전년(자동) {fmtCurrent(m, auto)}</span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <label className="flex flex-1 flex-col">
                        <span className="text-[10px] text-zinc-400">목표</span>
                        <input
                          inputMode="decimal"
                          value={form.targets[m] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, targets: { ...f.targets, [m]: e.target.value } }))
                          }
                          placeholder={unitHint(m)}
                          className="tabnum rounded border border-zinc-300 px-2 py-1 text-[12px] focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-1 flex-col">
                        <span className="text-[10px] text-zinc-400">전년(수기)</span>
                        <input
                          inputMode="decimal"
                          value={form.priorYear[m] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, priorYear: { ...f.priorYear, [m]: e.target.value } }))
                          }
                          placeholder={auto != null ? `자동 ${fmtCurrent(m, auto)}` : unitHint(m)}
                          className="tabnum rounded border border-zinc-300 px-2 py-1 text-[12px] focus:border-accent focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-zinc-700">비고</label>
              <textarea
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                rows={3}
                placeholder="특이사항·코멘트"
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-[12px] focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-zinc-700">조치</label>
              <textarea
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                rows={3}
                placeholder="대응·조치 계획"
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-[12px] focus:border-accent focus:outline-none"
              />
            </div>
          </section>

          {err && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{err}</p>
          )}
          {warn && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">{warn}</p>
          )}
          {msg && (
            <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">{msg}</p>
          )}
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-zinc-200 bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-2 text-[12px] text-zinc-600 hover:bg-zinc-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
