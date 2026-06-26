-- AlterTable
-- 하위호환: NOT NULL DEFAULT 0 → 기존 행 안전 백필. 멱등: IF NOT EXISTS.
-- 롤백: ALTER TABLE "fact_kanban" DROP COLUMN IF EXISTS "mSalesNet";
ALTER TABLE "fact_kanban" ADD COLUMN IF NOT EXISTS "mSalesNet" DECIMAL(18,2) NOT NULL DEFAULT 0;
