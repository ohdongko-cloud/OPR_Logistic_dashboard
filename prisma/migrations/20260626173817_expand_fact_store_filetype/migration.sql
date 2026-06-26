-- 매장② 팩트 확장 + 스냅샷 fileType 격리키
-- 근거: 02_파일분석/엔진_transform_spec_매장.md · store-engine-realfile.test(엑셀 100% 검증).
-- 안전: 멱등(IF NOT EXISTS) · 하위호환(신규 컬럼 NULL 허용 또는 DEFAULT) · 파괴적 변경 없음.
-- 롤백: 본 마이그레이션 보상은 ALTER TABLE ... DROP COLUMN IF EXISTS / DROP TYPE IF EXISTS.
--       (시계열 보존 원칙상 운영에서 컬럼 DROP 은 별도 확인 후.)

-- ── FileType enum (스냅샷 데이터셋 종류) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileType') THEN
    CREATE TYPE "FileType" AS ENUM ('ITEM', 'STORE', 'PRODUCT');
  END IF;
END$$;

-- ── snapshots.fileType (기존 행 = ITEM 기본) ──
ALTER TABLE "snapshots" ADD COLUMN IF NOT EXISTS "fileType" "FileType" NOT NULL DEFAULT 'ITEM';

-- ── fact_store 확장: 식별(채널·지점명) + 칸반 24 데이터열 + 마스터/(−)재고 ──
-- 기존 fact_store 컬럼(storeCode·gender·item·mStoQty·mStoAmt·mDeadSto)은 그대로 보존(삭제 금지).
-- 신규 데이터열 = NOT NULL DEFAULT 0(하위호환 백필). 마스터/(−)재고 = nullable.
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "storeName" TEXT NOT NULL DEFAULT '';

ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInQtyFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInAmtFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mRetQtyFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mRetAmtFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSaleQtyFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSaleAmtFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mCogsFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSummerInvQty" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSummerInvAmt" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInvQtyFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInvAmtFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mOpenQtyFix" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mOpenAmtFix" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInQtyAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInAmtAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mRetQtyAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mRetAmtAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSaleQtyAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mSaleAmtAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mCogsAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInvQtyAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mInvAmtAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mOpenQtyAll" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mOpenAmtAll" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- 기준 마스터(큐레이션 입력) + (−)재고 — nullable.
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "areaPyeong" DECIMAL(18,2);
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "baseInvQty" DECIMAL(18,2);
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "baseDisplayQty" DECIMAL(18,2);
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "baseRunQty" DECIMAL(18,2);
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "isCard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mNegQty" DECIMAL(18,2);
ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "mNegAmt" DECIMAL(18,2);

-- 레거시 컬럼(gender/item/mStoQty/mStoAmt/mDeadSto)은 매장 엔진에서 미사용 — 삭제하지 않고 보존(헌장).
-- 단 mStoQty/mStoAmt/mDeadSto 는 init 에서 NOT NULL DEFAULT 없음 → 신규 insert(매장 점포행)가
-- 이 값을 안 주므로 DEFAULT 0 부여(하위호환 — 기존 행 영향 없음, 신규 insert 성공).
ALTER TABLE "fact_store" ALTER COLUMN "mStoQty" SET DEFAULT 0;
ALTER TABLE "fact_store" ALTER COLUMN "mStoAmt" SET DEFAULT 0;
ALTER TABLE "fact_store" ALTER COLUMN "mDeadSto" SET DEFAULT 0;

-- 신규 인덱스(채널 드릴다운).
CREATE INDEX IF NOT EXISTS "fact_store_snapshotId_channel_idx" ON "fact_store" ("snapshotId", "channel");
