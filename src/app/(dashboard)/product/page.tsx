import { Suspense } from "react";

import { ProductView } from "@/components/product/product-view";

/**
 * ③ 상품 SCM — 브랜드(구매그룹코드)×시즌 입고→상품화→판매 누적 추적.
 * 설계문서 §2-C(슬3·4) · 02_파일분석/상품SCM_뷰_스펙.md(자동/수기 필드 분리).
 *
 * 상품 엔진(src/lib/engine-product)은 아이템 엔진과 측정식 동치(전체합 0차이 검증).
 * /api/product-agg 가 DB(FactProductCum CURRENT) 우선·라이브파일 폴백으로 3단 트리 반환.
 * 자동 8필드=값 · 자동불가 8(일자)=— · 수기 3(annotation)=✎(추후). 가짜값 금지.
 * useSearchParams(기간) 사용 → Suspense 경계 필요.
 */
export default function ProductPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-400">로딩 중…</div>}>
      <ProductView />
    </Suspense>
  );
}
