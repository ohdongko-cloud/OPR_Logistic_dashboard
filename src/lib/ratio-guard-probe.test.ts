/**
 * 비율 가드 probe — 3엔진(아이템·매장·상품) 매핑이 희소 분모 행에서 "—" 를 내는지 검증.
 *
 * 합성 행:
 *  - normal: 분모가 충분 → 비율 그대로.
 *  - sparse: 분모가 임계 미만 → 표기 보류("—").
 *  - nullRatio: 비율 null(분모0 공란) → 가드 무관(빈칸 그대로, suppressed=false).
 */

import { describe, it, expect } from "vitest";

import { guardRatio, RATIO_DENOM_MIN } from "./metric-guard";
import {
  ENGINE_RATIO_GUARD,
  engineRatioDenom,
  engineRatioMin,
} from "./engine/ratio-guard";
import {
  STORE_RATIO_GUARD,
  storeRatioDenom,
  storeRatioMin,
} from "./engine-store/ratio-guard";
import {
  PRODUCT_RATIO_GUARD,
  productRatioDenom,
  productRatioMin,
} from "./engine-product/ratio-guard";

describe("ratio-guard probe — 아이템 엔진", () => {
  it("물류비율: 매출 미미(12,000원) → 보류, 충분(10억) → 통과", () => {
    const min = engineRatioMin("logiRatio")!;
    expect(min).toBe(RATIO_DENOM_MIN.amount);

    // 14,000% 극단 — 매출(분모) 미미.
    const sparse = { sales: 12_000, logiRatio: 140 } as never;
    const denomS = engineRatioDenom("logiRatio", sparse);
    expect(guardRatio(140, denomS, min).suppressed).toBe(true);

    // 정상.
    const normal = { sales: 1_000_000_000, logiRatio: 0.13 } as never;
    const denomN = engineRatioDenom("logiRatio", normal);
    expect(guardRatio(0.13, denomN, min).suppressed).toBe(false);
  });

  it("센터재고일수: 일평균소진액 미미 → 보류(601일 같은 극단 차단)", () => {
    const min = engineRatioMin("dotsCtr")!;
    const sparse = { dailyOut: 5_000, dotsCtr: 601 } as never;
    expect(guardRatio(601, engineRatioDenom("dotsCtr", sparse), min).suppressed).toBe(true);
  });

  it("체화비중: 분모=재고액(ctrAmt/stoAmt) — 매핑 확인", () => {
    expect(ENGINE_RATIO_GUARD.deadCtrPct?.denomField).toBe("ctrAmt");
    expect(ENGINE_RATIO_GUARD.deadStoPct?.denomField).toBe("stoAmt");
  });

  it("가산필드(sales 등)는 가드 미적용 — min null", () => {
    expect(engineRatioMin("sales")).toBeNull();
    expect(engineRatioDenom("sales", {} as never)).toBeUndefined();
  });
});

describe("ratio-guard probe — 매장 엔진", () => {
  it("판매배수: 전체입고량 미미(5개) → 보류", () => {
    const min = storeRatioMin("saleMult")!;
    expect(min).toBe(RATIO_DENOM_MIN.qty);
    const sparse = { inQtyAll: 5, saleMult: 30 } as never;
    expect(guardRatio(30, storeRatioDenom("saleMult", sparse), min).suppressed).toBe(true);
    const normal = { inQtyAll: 5000, saleMult: 1.2 } as never;
    expect(guardRatio(1.2, storeRatioDenom("saleMult", normal), min).suppressed).toBe(false);
  });

  it("재고일수·시즌비중 매핑 분모 단위 확인", () => {
    expect(STORE_RATIO_GUARD.dotsDays?.unit).toBe("amount");
    expect(STORE_RATIO_GUARD.seasonPct?.unit).toBe("amount");
    expect(STORE_RATIO_GUARD.stockRatio?.unit).toBe("qty");
  });
});

describe("ratio-guard probe — 상품 엔진", () => {
  it("출고율/판매율: 입고량·출고량 미미 → 보류", () => {
    const minOut = productRatioMin("outRate")!;
    const sparse = { inQty: 3, outQty: 2, outRate: 0.66, saleVsOut: 5 } as never;
    expect(guardRatio(0.66, productRatioDenom("outRate", sparse), minOut).suppressed).toBe(true);
    expect(
      guardRatio(5, productRatioDenom("saleVsOut", sparse), productRatioMin("saleVsOut")!).suppressed,
    ).toBe(true);
  });

  it("매총율: 분모=매출액(금액) — 미미 매출이면 보류", () => {
    expect(PRODUCT_RATIO_GUARD.grossRate?.denomField).toBe("salesAmt");
    const min = productRatioMin("grossRate")!;
    expect(min).toBe(RATIO_DENOM_MIN.amount);
    const sparse = { salesAmt: 50_000, grossRate: 0.9 } as never;
    expect(guardRatio(0.9, productRatioDenom("grossRate", sparse), min).suppressed).toBe(true);
  });

  it("nullRatio(분모0 공란)는 모든 엔진에서 가드 무관(빈칸 유지)", () => {
    expect(guardRatio(null, 1, RATIO_DENOM_MIN.amount).suppressed).toBe(false);
    expect(guardRatio(null, 1, RATIO_DENOM_MIN.amount).value).toBeNull();
  });
});
