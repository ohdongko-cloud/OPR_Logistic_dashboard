/**
 * 상품 엔진 합성 단위테스트 — 측정식·SUMIFS·롤업 내부정합 검증(엑셀 ground truth 무관).
 *
 * 검증(spec §검증 — 슬3·4 수기라 셀대조 불가, 내부정합으로 대체):
 *  ① 측정식이 아이템 엔진과 동일(센터입출고 I/M·물류재고 H·매출상세 H/I/J SUMIFS, 키만 F×시즌).
 *  ② 브랜드별 합 = 전체 합(누락/이중계상 0) — 트리 어느 레벨 SUM 도 동일.
 *  ③ 파생 4필드(출고율·출고비/입고비판매·매총율) = 행단위 재계산(분모0 → null).
 */

import { describe, expect, it } from "vitest";

import { type RawRowRecord } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { buildProductDashboard, flattenProductTree } from "./stage2-product-tree";
import { buildProductFacts } from "./stage1-product";
import { PRODUCT_DATA_FIELDS } from "./types";

/** RawRowRecord 빌더(컬럼문자→값). */
function row(sheet: SheetType, data: Record<string, string | number>): RawRowRecord {
  return { sheetType: sheet, rowIndex: 0, skuKey: "", data };
}

/**
 * 합성 RAW: 브랜드 AAA/BBB × 시즌 봄/여름. 컬럼 좌표 = 실파일 핀고정.
 *   F=구매그룹(브랜드) · 시즌(매출 T·재고 V·입출고 W) · 측정(매출 H/I/J·재고 H·입출고 I/M).
 */
function synthRecords(): Partial<Record<SheetType, RawRowRecord[]>> {
  return {
    // 매출상세: F=brand, T=season, H=실매출액, I=원가, J=판매수량.
    매출상세: [
      row("매출상세", { F: "AAA", T: "봄", H: 1000, I: 600, J: 10 }),
      row("매출상세", { F: "AAA", T: "봄", H: 500, I: 300, J: 5 }), // 같은 grain 누적
      row("매출상세", { F: "AAA", T: "여름", H: 2000, I: 800, J: 20 }),
      row("매출상세", { F: "BBB", T: "봄", H: 4000, I: 1000, J: 40 }),
    ],
    // 물류재고: F=brand, V=season, H=재고량.
    물류재고: [
      row("물류재고", { F: "AAA", V: "봄", H: 100 }),
      row("물류재고", { F: "AAA", V: "여름", H: 200 }),
      row("물류재고", { F: "BBB", V: "봄", H: 400 }),
    ],
    // 센터입출고: F=brand, W=season, I=벤더입고량, M=점간출고량.
    센터입출고: [
      row("센터입출고", { F: "AAA", W: "봄", I: 50, M: 30 }),
      row("센터입출고", { F: "AAA", W: "여름", I: 80, M: 60 }),
      row("센터입출고", { F: "BBB", W: "봄", I: 200, M: 100 }),
    ],
  };
}

describe("상품 엔진 — 측정식·SUMIFS(brand×season)", () => {
  const facts = buildProductFacts({ records: synthRecords() });

  it("brand×season grain 으로 집계 — AAA봄·AAA여름·BBB봄 3행", () => {
    const keys = facts.map((f) => `${f.brandCode}/${f.season}`).sort();
    expect(keys).toEqual(["AAA/봄", "AAA/여름", "BBB/봄"]);
  });

  it("측정 SUMIFS — AAA봄: 입고50·재고100·출고30·판매15·매출1500·원가900", () => {
    const f = facts.find((x) => x.brandCode === "AAA" && x.season === "봄")!;
    expect(f.inQty).toBe(50); // 센터입출고 I
    expect(f.invQty).toBe(100); // 물류재고 H
    expect(f.outQty).toBe(30); // 센터입출고 M
    expect(f.saleQty).toBe(15); // 매출 J 누적(10+5)
    expect(f.salesAmt).toBe(1500); // 매출 H(1000+500)
    expect(f.cogs).toBe(900); // 매출 I(600+300)
  });

  it("파생 4필드 — 출고율=출고/입고 · 출고비판매=판매/출고 · 입고비판매=판매/입고 · 매총율=(매출−원가)/매출", () => {
    const f = facts.find((x) => x.brandCode === "AAA" && x.season === "봄")!;
    expect(f.outRate).toBeCloseTo(30 / 50, 10); // 0.6
    expect(f.saleVsOut).toBeCloseTo(15 / 30, 10); // 0.5
    expect(f.saleVsIn).toBeCloseTo(15 / 50, 10); // 0.3
    expect(f.grossRate).toBeCloseTo((1500 - 900) / 1500, 10); // 0.4
  });

  it("분모 0 → 파생 null(IFERROR 동치)", () => {
    const noFlow = buildProductFacts({
      records: {
        매출상세: [row("매출상세", { F: "ZZZ", T: "봄", H: 0, I: 0, J: 5 })],
      },
    });
    const f = noFlow.find((x) => x.brandCode === "ZZZ")!;
    expect(f.outRate).toBeNull(); // 입고 0
    expect(f.saleVsOut).toBeNull(); // 출고 0
    expect(f.saleVsIn).toBeNull(); // 입고 0
    expect(f.grossRate).toBeNull(); // 매출 0
  });
});

describe("상품 엔진 — 롤업 내부정합(브랜드 합 = 전체 합, 누락/이중계상 0)", () => {
  const facts = buildProductFacts({ records: synthRecords() });
  const dash = buildProductDashboard(facts);

  it("전체 데이터필드 = 모든 fact 의 단순 SUM (이중계상 0)", () => {
    for (const f of PRODUCT_DATA_FIELDS) {
      const leafSum = facts.reduce((s, r) => s + (r[f] as number), 0);
      expect((dash.root.fact[f] as number)).toBeCloseTo(leafSum, 6);
    }
  });

  it("전체 = Σ브랜드소계 = Σ시즌리프 (모든 레벨 합 일치)", () => {
    for (const f of PRODUCT_DATA_FIELDS) {
      const brandSum = dash.root.children.reduce((s, b) => s + (b.fact[f] as number), 0);
      const leafSum = dash.root.children
        .flatMap((b) => b.children)
        .reduce((s, l) => s + (l.fact[f] as number), 0);
      expect(brandSum).toBeCloseTo(dash.root.fact[f] as number, 6);
      expect(leafSum).toBeCloseTo(dash.root.fact[f] as number, 6);
    }
  });

  it("전체 입고량 = 280(50+80+200) · 전체 판매량 = 75(15+20+40)", () => {
    expect(dash.root.fact.inQty).toBe(50 + 80 + 200);
    expect(dash.root.fact.saleQty).toBe(15 + 20 + 40);
  });

  it("파생은 가중평균(합산 금지) — 전체 매총율 = (Σ매출−Σ원가)/Σ매출", () => {
    const totalSales = 1500 + 2000 + 4000;
    const totalCogs = 900 + 800 + 1000;
    expect(dash.root.fact.grossRate).toBeCloseTo((totalSales - totalCogs) / totalSales, 10);
  });

  it("트리 구조 — 전체(L0) → 브랜드 2(L1) → 시즌 리프 3(L2)", () => {
    const flat = flattenProductTree(dash.root);
    expect(flat.filter((n) => n.node.level === "L0_TOTAL").length).toBe(1);
    expect(flat.filter((n) => n.node.level === "L1_BRAND").length).toBe(2);
    expect(flat.filter((n) => n.node.level === "L2_SEASON").length).toBe(3);
  });
});
