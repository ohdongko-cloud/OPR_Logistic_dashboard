import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Vitest 설정 — RAW 파싱·ETL 단위 테스트.
 *
 * - environment: node (브라우저 API 불필요, 서버측 파싱)
 * - include: src/**·tests/** 의 *.test.ts
 * - alias @ → src (tsconfig paths 와 정합)
 * - src/app/** (Next 라우트)·*.config.* 는 커버리지 제외.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "prisma/**",
        "**/*.config.*",
        "src/app/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
