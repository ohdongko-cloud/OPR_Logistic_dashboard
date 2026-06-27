/**
 * resolveStoreRow 직영-한정(리뷰 #3) — 슬2 점포 표(r04~r17)는 직영 14점 전용.
 * 큐레이션에 비직영 점포가 섞여도 storeOrder 가 직영만 인덱싱해야 한다(엉뚱한 채널 점포 차단).
 *
 * ⚠️ 실파일/템플릿 불필요 — 합성 StoreDashRow 로 순수 매핑 로직만 검증.
 */

import { describe, expect, it } from "vitest";

import type { StoreDashRow } from "@/lib/engine-store";
import { resolveStoreRow } from "./inject";

/** 최소 StoreDashRow(데이터열은 식별에 무관 — null/0). */
function storeRow(code: string, channel: string): StoreDashRow {
  return {
    code,
    channel,
    name: code,
    level: "L2_STORE",
    saleMult: null,
    dotsDays: null,
    seasonPct: null,
    stockRatio: null,
    dotsDaysDenom: null,
    seasonPctDenom: null,
    areaPyeong: null,
    baseInvQty: null,
    baseDisplayQty: null,
    baseRunQty: null,
    inQtyFix: 0,
    runQtyFix: null,
    saleQtyFix: 0,
    summerInvQty: 0,
    invQtyFix: 0,
    inQtyAll: 0,
    runQtyAll: null,
    saleQtyAll: 0,
    invQtyAll: 0,
    negQty: null,
    negAmt: null,
  };
}

describe("resolveStoreRow storeOrder — 직영 한정(리뷰 #3)", () => {
  it("비직영 점포가 먼저 섞여 있어도 storeOrder 는 직영만 인덱싱한다", () => {
    // 큐레이션 등장순서: [중간관리 M1, 직영 D1, 기타 E1, 직영 D2]
    const rows: StoreDashRow[] = [
      storeRow("M1", "중간관리"),
      storeRow("D1", "직영"),
      storeRow("E1", "기타"),
      storeRow("D2", "직영"),
    ];
    // order=0 → 첫 직영(D1), order=1 → 둘째 직영(D2). 비직영(M1/E1)은 건너뜀.
    expect(resolveStoreRow(rows, { kind: "storeOrder", order: 0 })?.code).toBe("D1");
    expect(resolveStoreRow(rows, { kind: "storeOrder", order: 1 })?.code).toBe("D2");
    // 직영이 2점뿐이면 order=2 는 없음(공란 유지).
    expect(resolveStoreRow(rows, { kind: "storeOrder", order: 2 })).toBeNull();
  });

  it("직영 점포만 있으면 종전과 동일하게 순서대로 매핑된다(하위호환)", () => {
    const rows: StoreDashRow[] = [
      storeRow("D1", "직영"),
      storeRow("D2", "직영"),
      storeRow("D3", "직영"),
    ];
    expect(resolveStoreRow(rows, { kind: "storeOrder", order: 0 })?.code).toBe("D1");
    expect(resolveStoreRow(rows, { kind: "storeOrder", order: 2 })?.code).toBe("D3");
  });
});
