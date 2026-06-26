-- CreateTable: OtpToken (이메일 6자리 OTP — 해시 저장, ~10분 만료, 시도제한)
-- 멱등: IF NOT EXISTS. 하위호환: 신규 테이블(기존 데이터 영향 없음).
-- 롤백: DROP TABLE IF EXISTS "otp_tokens";
CREATE TABLE IF NOT EXISTS "otp_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "otp_tokens_email_idx" ON "otp_tokens"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "otp_tokens_email_consumedAt_idx" ON "otp_tokens"("email", "consumedAt");
