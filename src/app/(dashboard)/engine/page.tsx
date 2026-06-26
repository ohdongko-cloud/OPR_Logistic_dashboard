import { Suspense } from "react";

import { EngineView } from "@/components/engine/engine-view";

/**
 * ① 물류 핵심지표 (랜딩) — 시즌·아이템 엔진 드릴다운.
 * 설계문서 §2-A(25지표) · §3(5단계 드릴다운: 전체→성별→신상이월→시즌→아이템→SKU).
 *
 * 엔진(src/lib/engine)은 엑셀 100% 검증 완료 → /api/agg 가 실파일 파싱·집계 트리 반환.
 * useSearchParams(기간토글·필터) 사용 → Suspense 경계 필요.
 */
export default function EnginePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-zinc-400">로딩 중…</div>
      }
    >
      <EngineView />
    </Suspense>
  );
}
