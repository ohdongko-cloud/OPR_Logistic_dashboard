"use client";

import { useEffect, useState } from "react";

import { type FactKey } from "@/lib/engine";
import { fmtQty, fmtWon } from "@/lib/format";

/** SKU 상세(API 응답 grain). */
interface SkuDetail {
  skuKey: string;
  sales: number;
  estSales: number;
  logiCost: number;
  ctrQty: number;
  ctrAmt: number;
  stoAmt: number;
  ctrDeadAmt: number;
  inQty: number;
  outQty: number;
  retQty: number;
}

/**
 * SKU 사이드패널 (설계 §3 — 아이템 리프 클릭 → 칸반 grain SKU 상세).
 * 우측 슬라이드 패널 + 오버레이. period·4키로 /api/agg/sku fetch.
 */
export function SkuPanel({
  open,
  period,
  itemKey,
  label,
  onClose,
}: {
  open: boolean;
  period: "month" | "cumulative";
  itemKey: FactKey | null;
  label: string;
  onClose: () => void;
}) {
  const [skus, setSkus] = useState<SkuDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemKey) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setSkus([]);
      const qs = new URLSearchParams({
        period_type: period === "cumulative" ? "누적" : "당월",
        gender: itemKey.gender,
        newcarry: itemKey.newcarry,
        season: itemKey.season,
        item: itemKey.item,
      });
      try {
        const r = await fetch(`/api/agg/sku?${qs.toString()}`);
        const j = await r.json();
        if (cancelled) return;
        if (j.ok) setSkus(j.skus);
        else setError(j.detail ?? "조회 실패");
      } catch {
        if (!cancelled) setError("네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, period, itemKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">SKU 상세</h2>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && skus.length === 0 && (
            <p className="text-sm text-zinc-500">해당 아이템의 SKU가 없습니다.</p>
          )}
          {!loading && !error && skus.length > 0 && (
            <>
              <p className="mb-2 text-xs text-zinc-500">
                총 {skus.length} SKU (매출 내림차순) · 칸반 grain · 단위 원/PCS
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                      <th className="px-2 py-1.5 text-left font-medium">SKU</th>
                      <th className="px-2 py-1.5 text-right font-medium">매출액</th>
                      <th className="px-2 py-1.5 text-right font-medium">물류비</th>
                      <th className="px-2 py-1.5 text-right font-medium">센터재고량</th>
                      <th className="px-2 py-1.5 text-right font-medium">센터재고액</th>
                      <th className="px-2 py-1.5 text-right font-medium">센터체화액</th>
                      <th className="px-2 py-1.5 text-right font-medium">입고량</th>
                      <th className="px-2 py-1.5 text-right font-medium">출고량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skus.map((s) => (
                      <tr key={s.skuKey} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-2 py-1.5 font-mono text-zinc-700">{s.skuKey}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtWon(s.sales)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtWon(s.logiCost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(s.ctrQty)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtWon(s.ctrAmt)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtWon(s.ctrDeadAmt)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(s.inQty)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(s.outQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
