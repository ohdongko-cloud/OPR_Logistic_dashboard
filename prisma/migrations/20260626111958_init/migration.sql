-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTH', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "SnapStatus" AS ENUM ('PROCESSING', 'CURRENT', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SheetType" AS ENUM ('매출상세', '점재고', '물류재고', '센터입출고', '기초재고_센터', '기초재고_지점', '물류비예측', '분류');

-- CreateEnum
CREATE TYPE "PermLevel" AS ENUM ('VIEW', 'INPUT', 'MANAGE');

-- CreateEnum
CREATE TYPE "AnnoKind" AS ENUM ('REMARK', 'ACTION', 'TARGET', 'PRIOR_YEAR', 'LOGI_COST');

-- CreateEnum
CREATE TYPE "IngestPhase" AS ENUM ('UPLOAD', 'VALIDATE', 'PARSE', 'STAGE', 'TRANSFORM', 'PUBLISH');

-- CreateEnum
CREATE TYPE "IngestResult" AS ENUM ('OK', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "SnapStatus" NOT NULL DEFAULT 'PROCESSING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "blobUrl" TEXT,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_rows" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sheetType" "SheetType" NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "skuKey" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,

    CONSTRAINT "raw_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_kanban" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "newcarry" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "skuKey" TEXT,
    "mSales" DECIMAL(18,2) NOT NULL,
    "mLogiCost" DECIMAL(18,2) NOT NULL,
    "mRent" DECIMAL(18,2) NOT NULL,
    "mLabor" DECIMAL(18,2) NOT NULL,
    "mFreight" DECIMAL(18,2) NOT NULL,
    "mPack" DECIMAL(18,2) NOT NULL,
    "mCtrQty" DECIMAL(18,2) NOT NULL,
    "mCtrAmt" DECIMAL(18,2) NOT NULL,
    "mStoQty" DECIMAL(18,2) NOT NULL,
    "mStoAmt" DECIMAL(18,2) NOT NULL,
    "mOpenAll" DECIMAL(18,2) NOT NULL,
    "mOpenCtr" DECIMAL(18,2) NOT NULL,
    "mOpenSto" DECIMAL(18,2) NOT NULL,
    "mDailyOut" DECIMAL(18,2) NOT NULL,
    "mInQty" DECIMAL(18,2) NOT NULL,
    "mOutQty" DECIMAL(18,2) NOT NULL,
    "mRetQty" DECIMAL(18,2) NOT NULL,
    "mDeadCtr" DECIMAL(18,2) NOT NULL,
    "mDeadSto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "fact_kanban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dim_class" (
    "id" TEXT NOT NULL,
    "itemRaw" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "genderRaw" TEXT NOT NULL,
    "gender" TEXT NOT NULL,

    CONSTRAINT "dim_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "kind" "AnnoKind" NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "gender" TEXT,
    "newcarry" TEXT,
    "season" TEXT,
    "item" TEXT,
    "metricCode" TEXT,
    "numValue" DECIMAL(18,2),
    "textValue" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tab_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "level" "PermLevel" NOT NULL,

    CONSTRAINT "tab_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_logs" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "phase" "IngestPhase" NOT NULL,
    "result" "IngestResult" NOT NULL,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_store" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "gender" TEXT,
    "item" TEXT,
    "mStoQty" DECIMAL(18,2) NOT NULL,
    "mStoAmt" DECIMAL(18,2) NOT NULL,
    "mDeadSto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "fact_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_product_cum" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "skuKey" TEXT NOT NULL,
    "gender" TEXT,
    "season" TEXT,
    "item" TEXT,
    "mSalesCum" DECIMAL(18,2) NOT NULL,
    "mInCum" DECIMAL(18,2) NOT NULL,
    "mOutCum" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "fact_product_cum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "snapshots_periodType_periodEnd_idx" ON "snapshots"("periodType", "periodEnd");

-- CreateIndex
CREATE INDEX "snapshots_status_idx" ON "snapshots"("status");

-- CreateIndex
CREATE INDEX "raw_rows_snapshotId_sheetType_idx" ON "raw_rows"("snapshotId", "sheetType");

-- CreateIndex
CREATE INDEX "raw_rows_snapshotId_sheetType_skuKey_idx" ON "raw_rows"("snapshotId", "sheetType", "skuKey");

-- CreateIndex
CREATE INDEX "fact_kanban_snapshotId_gender_newcarry_season_item_idx" ON "fact_kanban"("snapshotId", "gender", "newcarry", "season", "item");

-- CreateIndex
CREATE INDEX "dim_class_itemRaw_idx" ON "dim_class"("itemRaw");

-- CreateIndex
CREATE INDEX "dim_class_genderRaw_idx" ON "dim_class"("genderRaw");

-- CreateIndex
CREATE INDEX "annotations_kind_periodType_periodStart_idx" ON "annotations"("kind", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "annotations_gender_newcarry_season_item_idx" ON "annotations"("gender", "newcarry", "season", "item");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tab_permissions_userId_tab_key" ON "tab_permissions"("userId", "tab");

-- CreateIndex
CREATE INDEX "ingest_logs_snapshotId_at_idx" ON "ingest_logs"("snapshotId", "at");

-- CreateIndex
CREATE INDEX "fact_store_snapshotId_storeCode_idx" ON "fact_store"("snapshotId", "storeCode");

-- CreateIndex
CREATE INDEX "fact_product_cum_snapshotId_skuKey_idx" ON "fact_product_cum"("snapshotId", "skuKey");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_rows" ADD CONSTRAINT "raw_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_kanban" ADD CONSTRAINT "fact_kanban_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tab_permissions" ADD CONSTRAINT "tab_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_logs" ADD CONSTRAINT "ingest_logs_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_store" ADD CONSTRAINT "fact_store_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_product_cum" ADD CONSTRAINT "fact_product_cum_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

