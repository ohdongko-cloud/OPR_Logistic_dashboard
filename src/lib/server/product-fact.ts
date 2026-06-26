/**
 * 상품 facts ↔ FactProductCum 양방향 매핑 (영속화 + 복원).
 *
 * 설계: 브랜드(구매그룹코드)×시즌 grain 박제. 자동 6 데이터필드만 저장,
 *   파생 4필드(출고율·출고비/입고비판매·매총율)는 복원 시 deriveProductRow 로 재계산
 *   (아이템 측정식 동형 보존 — 라운드트립 동일 출력).
 *
 * 복원 라운드트립: FactProductCum → ProductFactRow[] → buildProductDashboard
 *   = 라이브파일 경로와 동일 트리(product-fact.test 검증).
 */

import {
  deriveProductRow,
  type ProductFactRow,
} from "@/lib/engine-product";

/** FactProductCum insert 입력(Prisma createMany data). */
export interface FactProductInsert {
  snapshotId: string;
  brandCode: string;
  season: string;
  mInQty: number;
  mInvQty: number;
  mOutQty: number;
  mSaleQty: number;
  mSalesAmt: number;
  mCogs: number;
}

/** Decimal|string|number → number. */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(typeof v === "object" && "toString" in v ? String(v) : v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 상품 facts(brand×season) → FactProductCum insert 입력.
 * 자동 6 데이터필드만 저장(파생은 복원 시 재계산).
 */
export function productFactsToRows(
  facts: ProductFactRow[],
  snapshotId: string,
): FactProductInsert[] {
  return facts.map((f) => ({
    snapshotId,
    brandCode: f.brandCode,
    season: f.season,
    mInQty: f.inQty,
    mInvQty: f.invQty,
    mOutQty: f.outQty,
    mSaleQty: f.saleQty,
    mSalesAmt: f.salesAmt,
    mCogs: f.cogs,
  }));
}

/** DB FactProductCum 1행(Decimal unknown). */
export interface FactProductRow {
  brandCode: string;
  season: string | null;
  mInQty: unknown;
  mInvQty: unknown;
  mOutQty: unknown;
  mSaleQty: unknown;
  mSalesAmt: unknown;
  mCogs: unknown;
}

/**
 * DB FactProductCum 행들 → 상품 엔진 facts 복원(파생 재계산).
 * 데이터 6필드 복원 → deriveProductRow 로 파생 4필드 재계산(엔진 동형).
 */
export function factRowsToProduct(rows: FactProductRow[]): ProductFactRow[] {
  return rows.map((r) => {
    const data = {
      inQty: toNum(r.mInQty),
      invQty: toNum(r.mInvQty),
      outQty: toNum(r.mOutQty),
      saleQty: toNum(r.mSaleQty),
      salesAmt: toNum(r.mSalesAmt),
      cogs: toNum(r.mCogs),
    };
    return {
      brandCode: r.brandCode,
      season: r.season ?? "",
      ...data,
      ...deriveProductRow(data),
    };
  });
}
