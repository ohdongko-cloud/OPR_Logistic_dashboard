/**
 * 상품 fact 라운드트립 검증 — facts → FactProductCum insert → 복원 facts.
 *
 * 데이터 6필드 보존 + 파생 4필드 재계산(deriveProductRow) = 원본 facts 와 동일.
 * → DB 경로(영속화·복원)가 라이브파일 경로와 동일 트리를 낸다는 보증.
 */

import { describe, expect, it } from "vitest";

import { buildProductFacts } from "@/lib/engine-product";
import { type RawRowRecord } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { factRowsToProduct, productFactsToRows, type FactProductRow } from "./product-fact";

function row(sheet: SheetType, data: Record<string, string | number>): RawRowRecord {
  return { sheetType: sheet, rowIndex: 0, skuKey: "", data };
}

function synth(): Partial<Record<SheetType, RawRowRecord[]>> {
  return {
    매출상세: [
      row("매출상세", { F: "AAA", T: "봄", H: 1500, I: 900, J: 15 }),
      row("매출상세", { F: "AAA", T: "여름", H: 2000, I: 800, J: 20 }),
      row("매출상세", { F: "BBB", T: "봄", H: 4000, I: 1000, J: 40 }),
    ],
    물류재고: [
      row("물류재고", { F: "AAA", V: "봄", H: 100 }),
      row("물류재고", { F: "BBB", V: "봄", H: 400 }),
    ],
    센터입출고: [
      row("센터입출고", { F: "AAA", W: "봄", I: 50, M: 30 }),
      row("센터입출고", { F: "BBB", W: "봄", I: 200, M: 100 }),
    ],
  };
}

describe("상품 fact 라운드트립 (facts ↔ FactProductCum)", () => {
  const facts = buildProductFacts({ records: synth() });
  const inserts = productFactsToRows(facts, "snap-1");

  it("insert 행수 = facts 행수, 자동 6 데이터필드 보존", () => {
    expect(inserts.length).toBe(facts.length);
    const aaaSpring = inserts.find((r) => r.brandCode === "AAA" && r.season === "봄")!;
    expect(aaaSpring.mInQty).toBe(50);
    expect(aaaSpring.mInvQty).toBe(100);
    expect(aaaSpring.mOutQty).toBe(30);
    expect(aaaSpring.mSaleQty).toBe(15);
    expect(aaaSpring.mSalesAmt).toBe(1500);
    expect(aaaSpring.mCogs).toBe(900);
  });

  it("복원 facts = 원본 facts (데이터 보존 + 파생 재계산 동일)", () => {
    // DB Decimal 모사: number 그대로(Prisma Decimal → toString → Number).
    const dbRows: FactProductRow[] = inserts.map((r) => ({
      brandCode: r.brandCode,
      season: r.season,
      mInQty: r.mInQty,
      mInvQty: r.mInvQty,
      mOutQty: r.mOutQty,
      mSaleQty: r.mSaleQty,
      mSalesAmt: r.mSalesAmt,
      mCogs: r.mCogs,
    }));
    const restored = factRowsToProduct(dbRows);

    const byKey = (rows: typeof facts) =>
      new Map(rows.map((f) => [`${f.brandCode}/${f.season}`, f]));
    const orig = byKey(facts);
    const back = byKey(restored);
    expect(back.size).toBe(orig.size);
    for (const [k, o] of orig) {
      const r = back.get(k)!;
      expect(r.inQty).toBe(o.inQty);
      expect(r.invQty).toBe(o.invQty);
      expect(r.outQty).toBe(o.outQty);
      expect(r.saleQty).toBe(o.saleQty);
      expect(r.salesAmt).toBe(o.salesAmt);
      expect(r.cogs).toBe(o.cogs);
      // 파생 재계산 동일.
      expect(r.outRate).toBe(o.outRate);
      expect(r.saleVsOut).toBe(o.saleVsOut);
      expect(r.saleVsIn).toBe(o.saleVsIn);
      expect(r.grossRate).toBe(o.grossRate);
    }
  });
});
