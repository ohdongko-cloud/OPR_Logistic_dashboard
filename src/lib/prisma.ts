/**
 * Prisma Client 싱글턴 (Prisma 7 + Neon driver adapter).
 *
 * - Prisma 7 은 런타임 연결에 driver adapter 를 쓴다(@prisma/adapter-neon).
 * - DATABASE_URL 미설정 시 throw 하지 않고 null 을 돌려준다 → DB 의존 기능은
 *   호출부에서 `getPrisma()` null 체크로 graceful 처리(골격 단계 폴백).
 * - dev 핫리로드 중복 인스턴스 방지를 위해 globalThis 에 캐시.
 *
 * 실제 데이터 모델/쿼리는 아키텍처 확정 후 다음 단계에서 추가.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined;
};

function createClient(): PrismaClient | null {
  if (!env.DATABASE_URL) return null;
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

/** DB 미구성 시 null. 호출부에서 반드시 null 체크. */
export function getPrisma(): PrismaClient | null {
  if (globalForPrisma.prisma === undefined) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}
