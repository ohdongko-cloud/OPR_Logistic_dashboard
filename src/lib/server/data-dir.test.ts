/**
 * 데이터 폴더 해결 — dev 폴백·prod fail-fast(리뷰 #10).
 *
 * process.env 변형 대신 주입형 인자로 순수 분기를 검증(vitest 의 NODE_ENV 비변경성 회피).
 */

import { describe, expect, it } from "vitest";

import { resolveDataDir, DataDirError, DEV_DEFAULT_DATA_DIR } from "./data-dir";

describe("resolveDataDir", () => {
  it("OPR_DATA_DIR 설정 시 그 경로 사용(환경 무관)", () => {
    expect(resolveDataDir({ dataDir: "/mnt/opr-data", isProduction: true })).toBe("/mnt/opr-data");
    expect(resolveDataDir({ dataDir: "/mnt/opr-data", isProduction: false })).toBe("/mnt/opr-data");
  });

  it("미설정 + dev → 개발자 로컬 폴백", () => {
    expect(resolveDataDir({ dataDir: undefined, isProduction: false })).toBe(DEV_DEFAULT_DATA_DIR);
  });

  it("미설정 + production → fail-fast throw(절대경로 폴백 금지)", () => {
    expect(() => resolveDataDir({ dataDir: undefined, isProduction: true })).toThrow(DataDirError);
  });

  it("빈 문자열/공백 OPR_DATA_DIR 는 미설정으로 취급", () => {
    expect(() => resolveDataDir({ dataDir: "   ", isProduction: true })).toThrow(DataDirError);
    expect(resolveDataDir({ dataDir: "   ", isProduction: false })).toBe(DEV_DEFAULT_DATA_DIR);
  });
});
