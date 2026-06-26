"use client";

import { signOut } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * 메인영역 상단 헤더바 (레퍼런스 BI 양식).
 *
 * 좌측: 페이지 타이틀 + 기간 칩(●당월/○누적 토글, URL ?period 동기화).
 * 우측: 로그아웃.
 * 그 아래 얇은 구분선(컨테이너 border-b 로 처리).
 *
 * 기간 토글은 기존 PeriodToggle 과 동일한 URL 계약(?period=cumulative)을 쓴다 —
 * 엔진 뷰는 변경 없이 그대로 refetch.
 */
export function Topbar({
  title,
  subtitle,
  periodLocked,
}: {
  title: string;
  subtitle?: string;
  /** 당월 전용 뷰(매장) — 누적 칩 비활성(graceful). 매장은 누적본 미동봉. */
  periodLocked?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = params.get("period") === "cumulative" ? "cumulative" : "month";

  const setPeriod = useCallback(
    (next: "month" | "cumulative") => {
      const sp = new URLSearchParams(params.toString());
      if (next === "month") sp.delete("period");
      else sp.set("period", next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-3">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-zinc-900">{title}</h1>
          {subtitle && <p className="text-[11px] text-zinc-400">{subtitle}</p>}
        </div>

        {/* 기간 칩 */}
        <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-[12px]">
          <PeriodChip
            active={period === "month"}
            onClick={() => setPeriod("month")}
            label="당월"
          />
          <PeriodChip
            active={period === "cumulative"}
            onClick={() => setPeriod("cumulative")}
            label="누적"
            disabled={periodLocked}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

function PeriodChip({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      disabled={disabled}
      title={disabled ? "매장 SCM 은 당월만 제공됩니다(누적본 미동봉)." : undefined}
      className={[
        "inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-zinc-300"
          : active
            ? "bg-white text-accent shadow-sm"
            : "text-zinc-500 hover:text-zinc-700",
      ].join(" ")}
    >
      <span className="text-[10px] leading-none">{active ? "●" : "○"}</span>
      {label}
    </button>
  );
}
