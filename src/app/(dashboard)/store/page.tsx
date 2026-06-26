import { Suspense } from "react";

import { StoreView } from "@/components/store/store-view";

/**
 * ② 매장 SCM — 점포(채널) 단위 입고/판매/재고 드릴다운.
 * 설계: 엔진_transform_spec_매장.md(RAW→매장칸반→지점대시보드, 셀단위 100% 검증).
 *
 * 매장 엔진(src/lib/engine-store)은 엑셀 ※지점대시보드·매장전체칸반 캐시값과 100% 대조.
 * /api/store-agg 가 DB(FactStore CURRENT) 우선·라이브파일 폴백으로 3단 트리 반환.
 * useSearchParams(채널·기간) 사용 → Suspense 경계 필요. 매장은 당월만(누적 비활성).
 */
export default function StorePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-400">로딩 중…</div>}>
      <StoreView />
    </Suspense>
  );
}
