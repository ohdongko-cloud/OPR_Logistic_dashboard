/**
 * 슬라이드2(실행 모니터링① 매장 SCM) 표 셀 → 매장 엔진(StoreDashRow) 매핑.
 *
 * 근거:
 *   - 02_파일분석/실적_모니터링_PPT보고서_분석.md (Slide2: 행=전체→직영→지점, 열=운영평수·기준·픽스·매장·재고일수·판매배수·시즌비중·후방창고·(−)재고)
 *   - 원본 .pptx 실측: slide2 표 = 18행 × 22열. 데이터행 r02~r17, 데이터열 c02~c21.
 *   - 행 매핑 검증 앵커: 원본/마스킹 모두 c20((−)재고 수량)이 store negQty 와 행순서대로 1:1 일치
 *       (전체 → 직영 → 점포 순). 이 일치가 행 매핑의 결정적 근거(실수치는 런타임 주입만).
 *
 * 행 매핑(원본 좌표 row → store flatRows index):
 *   r02 = flatRows[0] 전체(L0_TOTAL)
 *   r03 = flatRows[1] 직영(L1_CHANNEL "직영")
 *   r04~r17 = flatRows[4]~[17] 직영 점포 14개(L2_STORE, 큐레이션 순서 = 카드 순서)
 *   ※중간관리·기타 채널은 슬2 표에 행이 없음(점포 14개 = 직영 큐레이션). 매핑 안 함.
 *
 * 열 매핑(원본 .pptx 실측 — 전체/직영/점포 데이터값 ↔ store 필드 대조 확정):
 *   c02 판매배수(saleMult) · c03 재고일수(dotsDays) · c04 시즌비중(seasonPct) · c05 재고보유율(stockRatio)
 *   c06 운영평수(areaPyeong) · c07 기준재고량(baseInvQty) · c08 기준진열량(baseDisplayQty) · c09 기준주판량(baseRunQty)
 *   c10 픽스입고량(inQtyFix) · c11 픽스주판량(runQtyFix) · c12 픽스판매량(saleQtyFix)
 *   c13 여름재고량(summerInvQty) · c14 픽스재고량(invQtyFix)
 *   c15 매장입고량(inQtyAll) · c16 매장주판량(runQtyAll) · c17 매장판매량(saleQtyAll) · c18 매장재고량(invQtyAll)
 *   c19 후방창고전환(수기 O/X — 주입 안 함) · c20 (−)재고수량(negQty) · c21 (−)재고금액(negAmt)
 *
 * 값 단위(원본 실측 ↔ store raw 환산):
 *   금액((−)재고금액) = 원 → ÷1e6 반올림(백만원, 콤마)
 *   비율(시즌비중·재고보유율) = 0~1 → ×100 0dp + '%'  (원본 c04 "33%", c05 "203%")
 *   일수(재고일수) = 0dp 반올림
 *   배수(판매배수) = 2dp  (원본 c02 "1.06")
 *   수량(나머지) = 0dp 반올림, 콤마
 *   (−)재고수량 = 절대값 괄호표기  (음수 → "(n)")  ← 원본 표기 보존(음수→괄호+양수콤마)
 */

import type { StoreDashRow } from "@/lib/engine-store";

/** 슬2 셀 값 포맷 종류. */
export type Slide2Scale = "mio" | "pct0" | "days" | "mult" | "qty" | "negQtyParen";

/** 슬2 표 데이터행(원본 좌표 row index) → store flatRows 의 행 식별. */
export interface Slide2RowRef {
  /** 원본 표 row index. */
  row: number;
  /** 표시/추적 라벨(검증 주석). */
  label: string;
  /** store flatRows 의 행 선택: 집계행은 code, 점포행은 dashIndex(직영 점포 순서). */
  match:
    | { kind: "total" }
    | { kind: "channel"; channel: string }
    | { kind: "storeOrder"; order: number }; // 직영 점포 0-base 순서
}

/**
 * 슬2 데이터행 → store 행 매핑.
 * 점포 순서(order)는 직영 큐레이션 카드 순서(flatRows 의 L2_STORE 등장 순서)와 동일.
 */
export const SLIDE2_ROWS: Slide2RowRef[] = [
  { row: 2, label: "OPR 전체", match: { kind: "total" } },
  { row: 3, label: "OPR 직영", match: { kind: "channel", channel: "직영" } },
  { row: 4, label: "점포1", match: { kind: "storeOrder", order: 0 } },
  { row: 5, label: "점포2", match: { kind: "storeOrder", order: 1 } },
  { row: 6, label: "점포3", match: { kind: "storeOrder", order: 2 } },
  { row: 7, label: "점포4", match: { kind: "storeOrder", order: 3 } },
  { row: 8, label: "점포5", match: { kind: "storeOrder", order: 4 } },
  { row: 9, label: "점포6", match: { kind: "storeOrder", order: 5 } },
  { row: 10, label: "점포7", match: { kind: "storeOrder", order: 6 } },
  { row: 11, label: "점포8", match: { kind: "storeOrder", order: 7 } },
  { row: 12, label: "점포9", match: { kind: "storeOrder", order: 8 } },
  { row: 13, label: "점포10", match: { kind: "storeOrder", order: 9 } },
  { row: 14, label: "점포11", match: { kind: "storeOrder", order: 10 } },
  { row: 15, label: "점포12", match: { kind: "storeOrder", order: 11 } },
  { row: 16, label: "점포13", match: { kind: "storeOrder", order: 12 } },
  { row: 17, label: "점포14", match: { kind: "storeOrder", order: 13 } },
];

/** 슬2 표 데이터열(원본 좌표 col index) → StoreDashRow 필드 + 포맷. */
export const SLIDE2_COLS: Array<{
  col: number;
  field: keyof StoreDashRow;
  scale: Slide2Scale;
  label: string;
}> = [
  { col: 2, field: "saleMult", scale: "mult", label: "판매배수" },
  { col: 3, field: "dotsDays", scale: "days", label: "재고일수" },
  { col: 4, field: "seasonPct", scale: "pct0", label: "시즌비중" }, // 원본 0~1 → "33%" 류
  { col: 5, field: "stockRatio", scale: "pct0", label: "재고보유율" }, // 기준재고 대비, "203%" 류
  { col: 6, field: "areaPyeong", scale: "qty", label: "운영평수" },
  { col: 7, field: "baseInvQty", scale: "qty", label: "기준재고량" },
  { col: 8, field: "baseDisplayQty", scale: "qty", label: "기준진열량" },
  { col: 9, field: "baseRunQty", scale: "qty", label: "기준주판량" },
  { col: 10, field: "inQtyFix", scale: "qty", label: "픽스입고량" },
  { col: 11, field: "runQtyFix", scale: "qty", label: "픽스주판량" },
  { col: 12, field: "saleQtyFix", scale: "qty", label: "픽스판매량" },
  { col: 13, field: "summerInvQty", scale: "qty", label: "여름재고량" },
  { col: 14, field: "invQtyFix", scale: "qty", label: "픽스재고량" },
  { col: 15, field: "inQtyAll", scale: "qty", label: "매장입고량" },
  { col: 16, field: "runQtyAll", scale: "qty", label: "매장주판량" },
  { col: 17, field: "saleQtyAll", scale: "qty", label: "매장판매량" },
  { col: 18, field: "invQtyAll", scale: "qty", label: "매장재고량" },
  // c19 후방창고전환(수기 O/X) — 자동 주입 안 함(공란/원본 유지).
  { col: 20, field: "negQty", scale: "negQtyParen", label: "(−)재고수량" },
  { col: 21, field: "negAmt", scale: "mio", label: "(−)재고금액" },
];

/** 슬2 표 차원: 행 18 × 열 22 (원본 실측 — 무결성 가드). */
export const SLIDE2_TABLE_DIMS = { rows: 18, cols: 22 } as const;

/**
 * store raw 값 → 원본 .pptx 표시 문자열.
 * null(분모0=공란)은 "" — 원본 빈칸과 동일.
 */
export function formatSlide2Cell(scale: Slide2Scale, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  switch (scale) {
    case "mio":
      return Math.round(v / 1e6).toLocaleString("en-US");
    case "pct0":
      return `${Math.round(v * 100)}%`;
    case "days":
      return `${Math.round(v)}`;
    case "mult":
      return v.toFixed(2);
    case "qty":
      return Math.round(v).toLocaleString("en-US");
    case "negQtyParen": {
      // (−)재고 수량: 음수 → 괄호 + 절대값 콤마(원본 "(n)" 표기). 0/양수면 그대로.
      const n = Math.round(v);
      return n < 0 ? `(${Math.abs(n).toLocaleString("en-US")})` : n.toLocaleString("en-US");
    }
    default:
      return String(v);
  }
}
