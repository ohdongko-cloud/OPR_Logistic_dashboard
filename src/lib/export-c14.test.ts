/**
 * C14 엑셀 내보내기 품질 가드 — 3 export(아이템·매장·상품)의 비율 셀이
 * 화면(metric-guard)과 동일하게 희소-분모를 보류("—")하고 비-비율 원시값은 보존함을 검증.
 *
 * 화면 가드와 동일 소스(engineRatio·storeRatio·productRatio 헬퍼)를 export 셀 빌더가 쓰므로,
 * 같은 입력에 대해 화면(guardedText)과 export 가 동일 판정을 내려야 한다.
 */

import { describe, expect, it } from "vitest";

import { aggCellValue } from "./export-xlsx";
import { storeCellValue } from "./export-store-xlsx";
import { productCellValue } from "./export-product-xlsx";
import { SUPPRESS_MARK } from "./metric-guard";
import {
  type AggColumn,
  type FactRow,
} from "@/lib/engine";
import {
  type StoreAggColumn,
  type StoreNodeMetrics,
} from "@/lib/engine-store";
import {
  type ProductAutoCol,
  type ProductTreeNodeDto,
} from "@/lib/engine-product";

// ── 아이템(engine) ──
describe("C14 아이템 export — 화면과 동일 가드", () => {
  const col = (field: keyof FactRow, format: AggColumn["format"]): AggColumn => ({
    field,
    label: String(field),
    excelCol: "X",
    format,
    defaultVisible: true,
  });

  /** sales(분모) 미미한 팩트행 — 물류비율 분모 amount<1백만. */
  const sparse = { sales: 12_000, logiCost: 1_000_000, logiRatio: 1_000_000 / 12_000 } as unknown as FactRow;
  const rich = { sales: 100_000_000, logiCost: 20_000_000, logiRatio: 0.2 } as unknown as FactRow;

  it("물류비율: 분모 미미 → '—'(화면 일치)", () => {
    expect(aggCellValue(col("logiRatio", "pct"), sparse)).toBe(SUPPRESS_MARK);
  });
  it("물류비율: 분모 충분 → 포맷값(20%)", () => {
    expect(aggCellValue(col("logiRatio", "pct"), rich)).toBe(20);
  });
  it("비-비율(매출액): 가드 무관 — 원시값 그대로", () => {
    expect(aggCellValue(col("sales", "eok"), sparse)).toBe(Number((12_000 / 1e8).toFixed(2)));
  });
});

// ── 매장(store) ──
describe("C14 매장 export — 화면과 동일 가드", () => {
  const col = (field: keyof StoreNodeMetrics, format: StoreAggColumn["format"]): StoreAggColumn => ({
    field,
    label: String(field),
    excelCol: "X",
    format,
    defaultVisible: true,
  });

  // seasonPct 분모 = seasonPctDenom(재고량, qty 임계 50). 3개 < 50 → 보류.
  const sparse = {
    seasonPct: 0.5,
    seasonPctDenom: 3,
    invQtyFix: 3,
  } as unknown as StoreNodeMetrics;
  const rich = {
    seasonPct: 0.33,
    seasonPctDenom: 9_000,
    invQtyFix: 9_000,
  } as unknown as StoreNodeMetrics;

  it("시즌비중: 재고량 분모 미미 → '—'", () => {
    expect(storeCellValue(col("seasonPct", "pct"), sparse)).toBe(SUPPRESS_MARK);
  });
  it("시즌비중: 분모 충분 → 포맷값(33%)", () => {
    expect(storeCellValue(col("seasonPct", "pct"), rich)).toBe(33);
  });
  it("비-비율(픽스재고량): 가드 무관 — 원시값 그대로", () => {
    expect(storeCellValue(col("invQtyFix", "qty"), sparse)).toBe(3);
  });
});

// ── 상품(product) ──
describe("C14 상품 export — 화면과 동일 가드", () => {
  const autoCol = (field: ProductAutoCol["field"], format: ProductAutoCol["format"]): ProductAutoCol => ({
    kind: "auto",
    field,
    label: String(field),
    format,
    source: "test",
    defaultVisible: true,
  });
  const node = (m: Partial<ProductTreeNodeDto["metrics"]>): ProductTreeNodeDto => ({
    id: "n",
    label: "n",
    level: "L0_TOTAL" as ProductTreeNodeDto["level"],
    metrics: m as ProductTreeNodeDto["metrics"],
    children: [],
    isLeaf: false,
  });

  // outRate 분모 = inQty(수량, 임계 50). 10개 < 50 → 보류.
  it("출고율: 입고량 분모 미미 → '—'", () => {
    expect(productCellValue(autoCol("outRate", "pct"), node({ outRate: 0.9, inQty: 10 }))).toBe(SUPPRESS_MARK);
  });
  it("출고율: 분모 충분 → 포맷값(90%)", () => {
    expect(productCellValue(autoCol("outRate", "pct"), node({ outRate: 0.9, inQty: 5_000 }))).toBe(90);
  });
  it("비-비율(입고량): 가드 무관 — 원시값 그대로", () => {
    expect(productCellValue(autoCol("inQty", "qty"), node({ inQty: 10 }))).toBe(10);
  });
});
