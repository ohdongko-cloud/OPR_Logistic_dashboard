import { ViewStub } from "@/components/view-stub";

/**
 * ② 매장 SCM — 점포(채널) 단위 입고/주판/판매/재고.
 * 설계문서 §2-B(M1~M12: 판매배수·재고일수·(−)재고 등).
 */
export default function StorePage() {
  return (
    <ViewStub
      title="② 매장 SCM"
      subtitle="점포(채널) 단위 입고·주판·판매·재고. 판매배수·재고일수·(−)마이너스재고 경고."
      source="R-004 매장전체칸반 · ※지점대시보드 · 설계 §2-B"
      planned={[
        "KPI 카드 (판매배수 · 재고일수(픽스) · (−)재고)",
        "점포 랭킹/테이블 + (−)재고 경고 강조",
        "채널 구성 도넛(직영·중간관리·기타)",
      ]}
    />
  );
}
