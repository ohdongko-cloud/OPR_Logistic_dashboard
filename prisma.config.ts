import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 설정 (연결 URL은 schema.prisma 가 아닌 여기서 관리).
 *
 * - schema        : 스키마 파일 위치
 * - migrations.path: 마이그레이션 SQL 디렉터리
 * - datasource.url : 마이그레이션/인트로스펙션 시 사용할 직접(unpooled) 연결 URL
 *                    (Neon "Connection pooling" OFF — hostname 에 '-pooler' 없음)
 * - 런타임 클라이언트는 driver adapter 로 연결 (src/lib/prisma.ts 참고).
 *
 * Prisma 7 은 .env 를 자동 로드하지 않으므로 여기서 명시적으로 읽는다(시크릿은
 * .gitignore 된 .env / .env.local 에만 존재 — 커밋·로그 금지).
 *
 * ⚠️ DATABASE_URL_UNPOOLED 미설정 시 migrate 명령은 실패한다(정상 — Neon 준비 후).
 */
loadEnv(); // .env
loadEnv({ path: ".env.local" }); // 로컬 오버라이드(OPR_DATA_DIR 등)
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Neon direct(unpooled) URL. .env / Vercel 에서 주입.
    url: process.env.DATABASE_URL_UNPOOLED,
  },
});
