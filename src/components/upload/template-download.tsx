"use client";

/**
 * 업로드 양식 템플릿 다운로드 버튼 (아이템/매장).
 *
 * 파서가 기대하는 시트·열 위치 그대로 박힌 빈 .xlsx 를 내려받아, 업로더가 어느 시트·
 * 어느 열에 무슨 값을 넣을지 헷갈리지 않게 한다. 실데이터 0(헤더·안내만).
 *
 * GET /api/upload/template?kind=item|store — 인증(logistics VIEW) 필요.
 */

import { useState } from "react";

type Kind = "item" | "store";

async function download(kind: Kind, setBusy: (k: Kind | null) => void): Promise<string | null> {
  setBusy(kind);
  try {
    const res = await fetch(`/api/upload/template?kind=${kind}`);
    if (!res.ok) {
      if (res.status === 401) return "로그인이 필요합니다.";
      if (res.status === 403) return "양식 다운로드 권한이 없습니다.";
      return "양식 다운로드에 실패했습니다.";
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
    const name = m
      ? decodeURIComponent(m[1]!)
      : kind === "item"
        ? "OPR_업로드양식_아이템.xlsx"
        : "OPR_업로드양식_매장.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch {
    return "네트워크 오류로 양식 다운로드에 실패했습니다.";
  } finally {
    setBusy(null);
  }
}

export function TemplateDownload() {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async (kind: Kind) => {
    setErr(null);
    const e = await download(kind, setBusy);
    if (e) setErr(e);
  };

  return (
    <div className="max-w-[760px] rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="mb-1 text-[14px] font-semibold text-zinc-800">업로드 양식 템플릿</h2>
      <p className="mb-3 text-[11.5px] text-zinc-500">
        SAP/BI RAW 를 채워 올리기 전, 어느 시트·어느 열에 무슨 값을 넣는지 헷갈리지 않도록
        <span className="font-medium text-zinc-700"> 헤더가 정확한 열 위치에 박힌 빈 양식</span>을
        내려받으세요. 첫 시트(README)에 시트별·핵심열 안내가 있습니다. (실데이터 없음 — 헤더·안내만)
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onClick("item")}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-[12px] font-medium text-zinc-700 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy === "item" ? "생성 중…" : "↓ 아이템 양식(6시트)"}
        </button>
        <button
          type="button"
          onClick={() => onClick("store")}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-[12px] font-medium text-zinc-700 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy === "store" ? "생성 중…" : "↓ 매장 양식(5시트)"}
        </button>
      </div>
      {err && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-[11.5px] text-red-600">
          {err}
        </p>
      )}
    </div>
  );
}
