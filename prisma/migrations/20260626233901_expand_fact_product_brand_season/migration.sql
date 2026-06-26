-- 상품③ 팩트 확장: fact_product_cum 을 브랜드(구매그룹코드)×시즌 grain 으로.
-- 근거: 02_파일분석/상품SCM_뷰_스펙.md(§2 필드출처·§3 grain=구매그룹 F×시즌) ·
--        product-engine-realfile.test(아이템 엔진 전체합과 측정식 동치 — 입고·재고·출고·판매·매출·원가 0차이).
-- 안전: 멱등(IF NOT EXISTS) · 하위호환(신규 데이터필드 NOT NULL DEFAULT 0 · season nullable) · 파괴적 변경 없음.
-- 롤백: 보상 = ALTER TABLE ... DROP COLUMN IF EXISTS (시계열 보존상 운영 DROP 은 별도 확인 후).

-- ── 상품 grain(브랜드코드 × 시즌) ──
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "brandCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "season" TEXT; -- 기존 init 에 이미 존재 가능 → 멱등

-- ── 자동 6 데이터필드(SUMIFS 동치 — 아이템 엔진과 측정식 동일) ──
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mInQty"    DECIMAL(18,2) NOT NULL DEFAULT 0; -- 입고량 ← 센터입출고 I
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mInvQty"   DECIMAL(18,2) NOT NULL DEFAULT 0; -- 재고량 ← 물류재고 H
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mOutQty"   DECIMAL(18,2) NOT NULL DEFAULT 0; -- 출고량 ← 센터입출고 M
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mSaleQty"  DECIMAL(18,2) NOT NULL DEFAULT 0; -- 판매량 ← 매출상세 J
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mSalesAmt" DECIMAL(18,2) NOT NULL DEFAULT 0; -- 실매출액 ← 매출상세 H
ALTER TABLE "fact_product_cum" ADD COLUMN IF NOT EXISTS "mCogs"     DECIMAL(18,2) NOT NULL DEFAULT 0; -- 총매출원가 ← 매출상세 I

-- ── 레거시 컬럼(init 자리 — 상품 엔진 미사용, 삭제 금지). 신규 insert(브랜드행)가 값을 안 주므로
--    skuKey DEFAULT '' · mSalesCum/mInCum/mOutCum DEFAULT 0 부여(하위호환 — 기존 행 영향 없음). ──
ALTER TABLE "fact_product_cum" ALTER COLUMN "skuKey" SET DEFAULT '';
ALTER TABLE "fact_product_cum" ALTER COLUMN "mSalesCum" SET DEFAULT 0;
ALTER TABLE "fact_product_cum" ALTER COLUMN "mInCum" SET DEFAULT 0;
ALTER TABLE "fact_product_cum" ALTER COLUMN "mOutCum" SET DEFAULT 0;

-- ── 신규 인덱스(브랜드 드릴다운). ──
CREATE INDEX IF NOT EXISTS "fact_product_cum_snapshotId_brandCode_idx" ON "fact_product_cum" ("snapshotId", "brandCode");
