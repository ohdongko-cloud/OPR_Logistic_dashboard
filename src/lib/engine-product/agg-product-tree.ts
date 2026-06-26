/**
 * 상품 드릴다운 트리(API 응답형) — 전체→브랜드→시즌 3단 + 브랜드 필터.
 *
 * 근거: spec §4 권장 뷰 · 매장 agg-store-tree 의 DTO 계약과 호환.
 *
 * buildProductDashboard 가 3단 트리(root)를 산출한다. 이 모듈은 그 위에
 *   직렬화 안전 노드(DTO) + 표시 지표(ProductNodeMetrics = fact 그대로)를 입힌다.
 */

import {
  buildProductDashboard,
  flattenProductTree,
  type ProductTreeNode,
} from "./stage2-product-tree";
import { type ProductFactRow, type ProductLevel } from "./types";

/** 상품 트리 노드 표시 지표 = 자동 8필드(데이터6 일부 + 파생4). 자동불가·수기는 뷰에서. */
export interface ProductNodeMetrics {
  // 입고 블록
  inQty: number; // 입고량 ✅ (센터입출고 I)
  // 상품화 블록
  invQty: number; // 재고량 ✅ (물류재고 H)
  // 판매 블록
  outQty: number; // 누적출고량 ✅ (센터입출고 M)
  outRate: number | null; // 누적출고율 ✅ (출고/입고)
  saleQty: number; // 누적판매량 ✅ (매출상세 J)
  saleVsOut: number | null; // 출고비판매율 ✅ (판매/출고)
  saleVsIn: number | null; // 입고비판매율 ✅ (판매/입고)
  grossRate: number | null; // 누적매총율 ✅ ((매출−원가)/매출)
  // 보조(검증·소계 표시용 — 화면 기본 숨김)
  salesAmt: number; // 실매출액(매출상세 H)
  cogs: number; // 총매출원가(매출상세 I)
}

/** 직렬화 안전 트리 노드(매장 DTO 계약 호환). */
export interface ProductTreeNodeDto {
  id: string;
  label: string;
  level: ProductLevel;
  brandCode?: string;
  season?: string;
  metrics: ProductNodeMetrics;
  children: ProductTreeNodeDto[];
  isLeaf: boolean;
}

export interface ProductAggFilter {
  /** 브랜드코드 지정 시 그 브랜드만 진입(루트 = 브랜드 노드). */
  brandCode?: string;
}

/** fact → 노드 지표. */
function metricsOf(f: ProductFactRow): ProductNodeMetrics {
  return {
    inQty: f.inQty,
    invQty: f.invQty,
    outQty: f.outQty,
    outRate: f.outRate,
    saleQty: f.saleQty,
    saleVsOut: f.saleVsOut,
    saleVsIn: f.saleVsIn,
    grossRate: f.grossRate,
    salesAmt: f.salesAmt,
    cogs: f.cogs,
  };
}

/** ProductTreeNode → DTO. */
function toDto(node: ProductTreeNode): ProductTreeNodeDto {
  return {
    id: node.id,
    label: node.label,
    level: node.level,
    brandCode: node.brandCode,
    season: node.season,
    metrics: metricsOf(node.fact),
    children: node.children.map(toDto),
    isLeaf: node.isLeaf,
  };
}

/**
 * 상품 드릴다운 트리(API 응답형).
 * @param filter.brandCode 지정 시 그 브랜드만 진입(루트 = 브랜드 노드, 라벨 반영).
 */
export function buildProductAggTree(
  facts: ProductFactRow[],
  filter: ProductAggFilter = {},
): ProductTreeNodeDto {
  const dashboard = buildProductDashboard(facts);

  if (filter.brandCode) {
    const brandNode = dashboard.root.children.find((c) => c.brandCode === filter.brandCode);
    if (brandNode) {
      const dto = toDto(brandNode);
      return { ...dto, id: "ROOT", label: `전체 · ${filter.brandCode}` };
    }
  }

  const dto = toDto(dashboard.root);
  return { ...dto, label: "전체 (상품 SCM)" };
}

/** 평탄화(엑셀 내보내기·검증용). */
export function flattenProductAggTree(
  node: ProductTreeNodeDto,
  depth = 0,
): Array<{ node: ProductTreeNodeDto; depth: number }> {
  const out: Array<{ node: ProductTreeNodeDto; depth: number }> = [{ node, depth }];
  for (const c of node.children) out.push(...flattenProductAggTree(c, depth + 1));
  return out;
}

export { flattenProductTree };
