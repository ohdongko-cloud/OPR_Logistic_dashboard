import { ViewStub } from "@/components/view-stub";

/**
 * ③ 상품 SCM — 브랜드·아이템 입고→상품화→판매 누적 추적.
 * 설계문서 §2-C(S1~S8). ★리드타임·단가류는 원천(SAP 일자컬럼) 확보 후 추가(§7 Q9).
 */
export default function ProductPage() {
  return (
    <ViewStub
      title="③ 상품 SCM"
      subtitle="브랜드·아이템 입고→상품화→판매 누적 추적 (매입/물류/영업 3책임)."
      source="R-006 물류전체칸반(누적) · PPT Slide 3·4 · 설계 §2-C"
      planned={[
        "누적 프로세스 테이블 (매입/물류/영업 3블록)",
        "확실 지표 우선(출고·판매·재고) → ★리드타임/단가는 원천확보 후",
        "비고(annotation) 표출",
      ]}
    />
  );
}
