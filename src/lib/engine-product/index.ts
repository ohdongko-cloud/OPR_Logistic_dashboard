/**
 * 상품(브랜드) SCM 엔진 공개 표면.
 *
 * 흐름(spec §3·§5):
 *   아이템 RAW records ─Stage1→ buildProductFacts → ProductFactRow[](브랜드 F × 시즌 grain)
 *                      ─Stage2→ buildProductDashboard → 전체→브랜드→시즌 3단 트리
 *                      ─DTO───→ buildProductAggTree (직렬화 안전 API 응답형)
 *
 * 측정식 = 검증된 아이템 엔진과 동일(센터입출고 I/M·물류재고 H·매출상세 H/I/J), 키만 구매그룹(F)×시즌.
 * 자동 8필드만 엔진이 산출. 자동불가 8(일자)·수기 3(annotation)은 뷰/annotation 책임.
 */

export * from "./types";
export * from "./raw-columns";
export * from "./stage1-product";
export * from "./stage2-product-tree";
export * from "./agg-product-tree";
export * from "./agg-product-columns";
export * from "./ratio-guard";
