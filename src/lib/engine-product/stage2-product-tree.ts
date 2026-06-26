/**
 * Stage2 — 상품 facts(brand×season) → 3단 ROLLUP(전체→브랜드→시즌) + 노드 지표.
 *
 * 근거: spec §4(브랜드×시즌 테이블)·§5-A(측정식 아이템 동일) · 매장 stage2 ROLLUP 패턴.
 *
 *  - 데이터 6필드 = season GROUP BY SUM → 브랜드 = 시즌 SUM · 전체 = 브랜드 SUM(SUMIFS 흡수).
 *  - 파생 4필드(출고율·출고비/입고비판매·매총율) = 집계 후 행단위 재계산(비율 합산 금지 = 가중평균).
 *
 * 내부정합(spec §검증): 브랜드별 합 = 전체 합(누락/이중계상 0) — 데이터필드는 단순 SUM 이므로
 *   트리 어느 레벨에서 합해도 동일(테스트가 보증).
 */

import {
  PRODUCT_DATA_FIELDS,
  type ProductDataField,
  type ProductFactRow,
  type ProductLevel,
} from "./types";

/** IFERROR(분자/분모,"") → null. */
function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/** 데이터 6필드 합산행(파생 재계산 포함) — code/season 라벨 부여. */
function aggregate(rows: ProductFactRow[], brandCode: string, season: string): ProductFactRow {
  const acc = blankFact(brandCode, season);
  for (const r of rows) {
    for (const f of PRODUCT_DATA_FIELDS) {
      (acc[f] as number) += (r[f] as number) ?? 0;
    }
  }
  return deriveFact(acc);
}

/** 빈 fact(데이터 0, 파생 null). */
function blankFact(brandCode: string, season: string): ProductFactRow {
  const z = {} as Record<ProductDataField, number>;
  for (const f of PRODUCT_DATA_FIELDS) z[f] = 0;
  return {
    brandCode,
    season,
    ...z,
    outRate: null,
    saleVsOut: null,
    saleVsIn: null,
    grossRate: null,
  };
}

/** 파생 재계산(집계 후 — 아이템 측정식 동일). */
function deriveFact(f: ProductFactRow): ProductFactRow {
  f.outRate = safeDiv(f.outQty, f.inQty);
  f.saleVsOut = safeDiv(f.saleQty, f.outQty);
  f.saleVsIn = safeDiv(f.saleQty, f.inQty);
  f.grossRate = safeDiv(f.salesAmt - f.cogs, f.salesAmt);
  return f;
}

/** 트리 노드 — fact 집계 + 자식. */
export interface ProductTreeNode {
  id: string;
  /** 표시 라벨(전체 / 브랜드코드 / 시즌). */
  label: string;
  level: ProductLevel;
  /** 브랜드코드(L1·L2). 전체는 undefined. */
  brandCode?: string;
  /** 시즌(L2 리프). */
  season?: string;
  /** 이 노드의 집계 fact(데이터 SUM + 파생 재계산). */
  fact: ProductFactRow;
  children: ProductTreeNode[];
  isLeaf: boolean;
}

export interface ProductDashboard {
  /** 루트(전체) → 브랜드 → 시즌 3단. */
  root: ProductTreeNode;
}

/**
 * Stage2 메인 — facts(brand×season) → 3단 트리.
 */
export function buildProductDashboard(facts: ProductFactRow[]): ProductDashboard {
  // 브랜드 GROUP BY.
  const byBrand = new Map<string, ProductFactRow[]>();
  for (const f of facts) {
    const list = byBrand.get(f.brandCode);
    if (list) list.push(f);
    else byBrand.set(f.brandCode, [f]);
  }

  // 브랜드 노드(시즌 리프 + 브랜드 소계).
  const brandCodes = [...byBrand.keys()].sort((a, b) => a.localeCompare(b));
  const brandNodes: ProductTreeNode[] = brandCodes.map((code) => {
    const seasonRows = byBrand.get(code)!;
    const leaves: ProductTreeNode[] = seasonRows
      .slice()
      .sort((a, b) => a.season.localeCompare(b.season))
      .map((r) => ({
        id: `product:${code}:${r.season || "_"}`,
        label: r.season || "(미지정)",
        level: "L2_SEASON" as ProductLevel,
        brandCode: code,
        season: r.season,
        fact: r,
        children: [],
        isLeaf: true,
      }));
    const agg = aggregate(seasonRows, code, "");
    return {
      id: `brand:${code}`,
      label: code,
      level: "L1_BRAND" as ProductLevel,
      brandCode: code,
      fact: agg,
      children: leaves,
      isLeaf: false,
    };
  });

  // 전체 = 브랜드 SUM (= 시즌 전체 SUM 동일).
  const totalAgg = aggregate(facts, "전체", "");
  const root: ProductTreeNode = {
    id: "ROOT",
    label: "전체",
    level: "L0_TOTAL",
    fact: totalAgg,
    children: brandNodes,
    isLeaf: false,
  };

  return { root };
}

/** 트리 평탄화(깊이우선 — 검증·엑셀용). */
export function flattenProductTree(
  node: ProductTreeNode,
  depth = 0,
): Array<{ node: ProductTreeNode; depth: number }> {
  const out: Array<{ node: ProductTreeNode; depth: number }> = [{ node, depth }];
  for (const c of node.children) out.push(...flattenProductTree(c, depth + 1));
  return out;
}
