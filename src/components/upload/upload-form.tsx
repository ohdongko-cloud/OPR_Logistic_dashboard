"use client";

import { useCallback, useRef, useState } from "react";

import { SnapshotHistory } from "./snapshot-history";

/**
 * 데이터 업로드 폼 — SAP RAW .xlsx → 검증 → 새 CURRENT 스냅샷 적재(주1회 운영).
 *
 * 근거: 작업지시 §2 · POST /api/upload(input MANAGE 서버 게이트).
 *
 * 흐름:
 *   파일 선택/드래그 → 종류(자동/아이템/매장)·기간(당월/누적)·앵커(자동/수정) →
 *   업로드 → 적재 결과(스냅샷·fact수·오류) 표시 → 이력 새로고침.
 *
 * 인가: 페이지는 canUpload(input MANAGE) 인 사용자만 폼을 본다. 서버 /api/upload 가
 *   최종 강제(VIEWER 는 403). 여기 게이트는 UX 일 뿐.
 */

type UploadKind = "auto" | "item" | "store";
type PeriodType = "MONTH" | "CUMULATIVE";

interface Outcome {
  file: string;
  kind: "item" | "store";
  fileType: "ITEM" | "PRODUCT" | "STORE";
  periodType: PeriodType;
  snapshotId: string;
  status: string;
  factRows: number;
  supersededId: string | null;
  anchorSource?: "file" | "default";
  anchors?: { salesDays: number; monthDays: number; factor: number };
}

interface UploadResponse {
  ok: boolean;
  staged?: boolean;
  dbReady?: boolean;
  error?: string;
  detail?: string;
  note?: string;
  outcomes?: Outcome[];
  errors?: Array<{ file: string; detail: string }>;
}

const FILE_TYPE_LABEL: Record<string, string> = {
  ITEM: "아이템(물류 핵심지표)",
  PRODUCT: "상품 SCM",
  STORE: "매장 SCM",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<UploadKind>("auto");
  const [periodMode, setPeriodMode] = useState<"auto" | PeriodType>("auto");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [anchorMode, setAnchorMode] = useState<"auto" | "manual">("auto");
  const [salesDays, setSalesDays] = useState("");
  const [monthDays, setMonthDays] = useState("");
  const [factor, setFactor] = useState("");

  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const xlsx = Array.from(list).filter((f) => /\.xlsx$/i.test(f.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...xlsx.filter((f) => !names.has(f.name))];
    });
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const onUpload = useCallback(async () => {
    setErr(null);
    setResult(null);
    if (files.length === 0) {
      setErr("업로드할 .xlsx 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      if (kind !== "auto") fd.append("kind", kind);
      if (periodMode !== "auto") fd.append("period_type", periodMode);
      if (periodStart) fd.append("period_start", periodStart);
      if (periodEnd) fd.append("period_end", periodEnd);
      if (anchorMode === "manual") {
        if (salesDays) fd.append("sales_days", salesDays);
        if (monthDays) fd.append("month_days", monthDays);
        if (factor) fd.append("factor", factor);
      }

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json: UploadResponse = await res.json().catch(() => ({ ok: false }));

      if (res.status === 401) {
        setErr("로그인이 필요합니다.");
      } else if (res.status === 403) {
        setErr("업로드 권한이 없습니다(입력 MANAGE 필요).");
      } else if (!res.ok && !json.outcomes) {
        setErr(json.detail ?? json.note ?? "업로드 실패");
      } else {
        setResult(json);
        if (json.staged) {
          setFiles([]);
          setHistoryKey((k) => k + 1); // 이력 새로고침
        }
      }
    } catch {
      setErr("네트워크 오류로 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }, [files, kind, periodMode, periodStart, periodEnd, anchorMode, salesDays, monthDays, factor]);

  return (
    <div className="space-y-5">
      {/* 업로드 카드 */}
      <div className="max-w-[760px] rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-[14px] font-semibold text-zinc-800">RAW 엑셀 업로드</h2>
        <p className="mb-4 text-[11.5px] text-zinc-500">
          SAP 추출 RAW(.xlsx)를 올리면 검증 후 새 CURRENT 스냅샷으로 적재됩니다. 아이템 파일은
          <span className="font-medium text-zinc-700"> 물류 핵심지표 + 상품 SCM</span>, 매장 파일은
          <span className="font-medium text-zinc-700"> 매장 SCM</span>이 함께 갱신됩니다.
        </p>

        {/* 드롭존 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={[
            "flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging
              ? "border-accent bg-accent/5"
              : "border-zinc-300 bg-zinc-50 hover:border-accent/60",
          ].join(" ")}
        >
          <span className="text-[22px] text-zinc-400">↥</span>
          <p className="mt-1 text-[12.5px] text-zinc-600">
            여기로 .xlsx 파일을 드래그하거나 클릭해 선택
          </p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">아이템(당월/누적) · 매장(당월) 동시 가능</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* 선택된 파일 목록 */}
        {files.length > 0 && (
          <ul className="mt-3 space-y-1">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-1.5 text-[12px]"
              >
                <span className="truncate text-zinc-700">{f.name}</span>
                <span className="ml-3 flex items-center gap-2">
                  <span className="tabnum text-[10.5px] text-zinc-400">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.name);
                    }}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    제거
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 옵션 — 종류·기간 */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col">
            <span className="text-[10px] text-zinc-400">파일 종류</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as UploadKind)}
              className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
            >
              <option value="auto">자동판별</option>
              <option value="item">아이템</option>
              <option value="store">매장(당월)</option>
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] text-zinc-400">기간 유형</span>
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as "auto" | PeriodType)}
              className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
            >
              <option value="auto">자동판별</option>
              <option value="MONTH">당월</option>
              <option value="CUMULATIVE">누적</option>
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] text-zinc-400">귀속 시작일(선택)</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-[10px] text-zinc-400">귀속 종료일</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-[12px]"
            />
          </label>
        </div>

        {/* 앵커(아이템 전용) */}
        <div className="mt-3 rounded-md border border-zinc-100 bg-zinc-50 p-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-zinc-600">엔진 앵커(아이템)</span>
            <label className="flex items-center gap-1 text-[11px] text-zinc-600">
              <input
                type="radio"
                name="anchorMode"
                checked={anchorMode === "auto"}
                onChange={() => setAnchorMode("auto")}
              />
              칸반 자동추출
            </label>
            <label className="flex items-center gap-1 text-[11px] text-zinc-600">
              <input
                type="radio"
                name="anchorMode"
                checked={anchorMode === "manual"}
                onChange={() => setAnchorMode("manual")}
              />
              수동 입력
            </label>
          </div>
          {anchorMode === "manual" && (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="flex flex-col">
                <span className="text-[10px] text-zinc-400">판매일수(D1/E1)</span>
                <input
                  inputMode="decimal"
                  value={salesDays}
                  onChange={(e) => setSalesDays(e.target.value)}
                  placeholder="21 / 172"
                  className="tabnum w-28 rounded border border-zinc-300 px-2 py-1 text-right text-[12px]"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-zinc-400">월일수(E1/F1)</span>
                <input
                  inputMode="decimal"
                  value={monthDays}
                  onChange={(e) => setMonthDays(e.target.value)}
                  placeholder="30 / 181"
                  className="tabnum w-28 rounded border border-zinc-300 px-2 py-1 text-right text-[12px]"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-zinc-400">계수(F1/G1)</span>
                <input
                  inputMode="decimal"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  placeholder="1.22 / 1.02"
                  className="tabnum w-28 rounded border border-zinc-300 px-2 py-1 text-right text-[12px]"
                />
              </label>
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-zinc-400">
            자동추출 = 칸반 D1/E1/F1(당월)·E1/F1/G1(누적). 추출 실패 시 기본값(당월 21/30/1.22 ·
            누적 172/181/1.02).
          </p>
        </div>

        {err && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
            {err}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading || files.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? "업로드·적재 중…" : `업로드 (${files.length})`}
          </button>
        </div>
      </div>

      {/* 적재 결과 */}
      {result && <ResultPanel result={result} />}

      {/* 스냅샷 이력 (복원 토글 포함) — 복원 성공 시 이력 갱신키 bump(서버는 캐시 무효화). */}
      <SnapshotHistory
        refreshKey={historyKey}
        onRestored={() => setHistoryKey((k) => k + 1)}
      />
    </div>
  );
}

function ResultPanel({ result }: { result: UploadResponse }) {
  const outcomes = result.outcomes ?? [];
  const errs = result.errors ?? [];
  return (
    <div className="max-w-[760px] rounded-lg border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-zinc-800">적재 결과</h3>
        <span
          className={[
            "rounded px-2 py-0.5 text-[10.5px]",
            result.ok
              ? "bg-green-50 text-green-700"
              : outcomes.length > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-red-50 text-red-600",
          ].join(" ")}
        >
          {result.note}
        </span>
      </div>

      {outcomes.length > 0 && (
        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">파일</th>
                <th className="px-3 py-1.5 text-left font-medium">갱신 대상</th>
                <th className="px-3 py-1.5 text-left font-medium">기간</th>
                <th className="px-3 py-1.5 text-right font-medium">fact수</th>
                <th className="px-3 py-1.5 text-left font-medium">상태</th>
                <th className="px-3 py-1.5 text-left font-medium">대체(이전)</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o, i) => (
                <tr key={`${o.snapshotId}-${i}`} className="border-t border-zinc-100">
                  <td className="px-3 py-1.5 text-zinc-700">{o.file}</td>
                  <td className="px-3 py-1.5 text-zinc-700">
                    {FILE_TYPE_LABEL[o.fileType] ?? o.fileType}
                    {o.anchorSource && (
                      <span className="ml-1 text-[10px] text-zinc-400">
                        (앵커 {o.anchorSource === "file" ? "자동" : "수동/기본"})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-600">
                    {o.periodType === "CUMULATIVE" ? "누적" : "당월"}
                  </td>
                  <td className="tabnum px-3 py-1.5 text-right text-zinc-700">
                    {o.factRows.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                      {o.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-zinc-400">
                    {o.supersededId ? "이전 CURRENT → SUPERSEDED" : "신규"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errs.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errs.map((e, i) => (
            <li
              key={i}
              className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-[11.5px] text-red-600"
            >
              <span className="font-medium">{e.file}</span> — {e.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
