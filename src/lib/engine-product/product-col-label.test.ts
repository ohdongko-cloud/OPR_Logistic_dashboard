/**
 * 상품 컬럼 라벨 — 기간 접두("누적"/"당월") 동적 부착 검증(데이터=라벨 단일진실원).
 *
 * 회귀 방지: 당월 스냅샷이면 출고량/출고율/판매량/매총율 라벨이 "당월…",
 *   누적이면 "누적…" 으로 표기되어 "누적"이라 적힌 칸에 당월 값이 들어가는 불일치를 차단.
 */

import { describe, expect, it } from "vitest";

import {
  periodPrefixOf,
  productColLabel,
  PRODUCT_AUTO_COLS,
  PRODUCT_FIELD_COUNTS,
} from "./agg-product-columns";

describe("periodPrefixOf — 기간 라벨 정규화", () => {
  it("'누적'/'CUMULATIVE' → 누적", () => {
    expect(periodPrefixOf("누적")).toBe("누적");
    expect(periodPrefixOf("CUMULATIVE")).toBe("누적");
    expect(periodPrefixOf("cumulative")).toBe("누적");
  });

  it("'당월'/'MONTH'/그외 → 당월", () => {
    expect(periodPrefixOf("당월")).toBe("당월");
    expect(periodPrefixOf("MONTH")).toBe("당월");
    expect(periodPrefixOf("")).toBe("당월");
  });
});

describe("productColLabel — periodPrefix 컬럼 동적 라벨", () => {
  const cols = Object.fromEntries(PRODUCT_AUTO_COLS.map((c) => [c.field, c]));

  it("periodPrefix 컬럼은 기간 접두 부착(출고량·출고율·판매량·매총율)", () => {
    expect(productColLabel(cols.outQty, "누적")).toBe("누적출고량");
    expect(productColLabel(cols.outQty, "당월")).toBe("당월출고량");
    expect(productColLabel(cols.outRate, "당월")).toBe("당월출고율");
    expect(productColLabel(cols.saleQty, "누적")).toBe("누적판매량");
    expect(productColLabel(cols.grossRate, "당월")).toBe("당월매총율");
  });

  it("periodPrefix 없는 컬럼은 정적 라벨 그대로(입고량·출고비판매율·입고비판매율)", () => {
    expect(productColLabel(cols.inQty, "누적")).toBe("입고량");
    expect(productColLabel(cols.inQty, "당월")).toBe("입고량");
    expect(productColLabel(cols.saleVsOut, "당월")).toBe("출고비판매율");
    expect(productColLabel(cols.saleVsIn, "누적")).toBe("입고비판매율");
  });

  it("당월 스냅샷에서 '누적' 접두가 라벨에 남지 않는다(라벨/데이터 불일치 차단)", () => {
    for (const c of PRODUCT_AUTO_COLS) {
      const monthLabel = productColLabel(c, "당월");
      expect(monthLabel.startsWith("누적")).toBe(false);
    }
  });

  it("베이스 라벨에 '누적' 하드코딩이 없다(기간 접두는 동적만)", () => {
    for (const c of PRODUCT_AUTO_COLS) {
      expect(c.label.includes("누적")).toBe(false);
    }
  });
});

describe("PRODUCT_FIELD_COUNTS — 라벨 변경 후에도 8/8/3 불변", () => {
  it("auto 8 · na 8 · manual 3", () => {
    expect(PRODUCT_FIELD_COUNTS.auto).toBe(8);
    expect(PRODUCT_FIELD_COUNTS.na).toBe(8);
    expect(PRODUCT_FIELD_COUNTS.manual).toBe(3);
  });
});
