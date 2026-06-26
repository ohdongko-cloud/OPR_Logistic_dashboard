/**
 * 실파일 파싱 검증 (증거 테스트).
 *
 * ⚠️ 실데이터 파일은 레포에 복사·커밋하지 않는다(보안). 절대경로로 "참조만" 한다.
 *    파일 부재 시(다른 환경) test 는 skip — CI 안전.
 *
 * 검증 목표(아키텍처 R1 해소 + 분석문서 §2 대조):
 *  - 14시트 전수 감지, 6 RAW 시트 SheetType 정확 판별
 *  - 각 RAW 시트 데이터행 수가 분석문서/실측과 일치
 *  - buildRawRows 가 SKU 조인키를 정상 추출
 */

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildRawRows, parseWorkbook } from "./parse-workbook";
import { validateSheetSet } from "./validate-sheetset";
import { type SheetType } from "./sheet-types";

// 실파일 경로 — 레포 밖(워크스페이스 원본). 복사 금지.
const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";

const HAS_FILE = existsSync(REAL_FILE);

/**
 * 실측 데이터행 수(probe 로 확정 — total_aoa - 6 header rows, blankrows:false).
 * 분석문서 §2 의 시트 dimension(!ref rows)과 정합:
 *   매출상세 1804행(ref) → 데이터 1797 / 점재고 3960 → 3954 / 물류재고 3317 → 3311 …
 */
const EXPECTED_DATA_ROWS: Record<string, number> = {
  매출상세: 1797,
  점재고: 3954,
  물류재고: 3311,
  센터입출고: 1919,
  기초재고_지점: 4024,
  기초재고_센터: 3051,
};

describe.skipIf(!HAS_FILE)("실파일 파싱 (당월 모니터링 아이템)", () => {
  const buf = HAS_FILE ? readFileSync(REAL_FILE) : Buffer.alloc(0);
  const wb = HAS_FILE
    ? parseWorkbook(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    : { sheets: [], ignored: [] };

  it("6 RAW 시트를 모두 정확한 SheetType 으로 감지", () => {
    const set = validateSheetSet([wb]);
    expect(set.missing).toEqual([]);
    expect(set.ok).toBe(true);
    // 중복 감지 없어야(재고 4탭 타이브레이크 정상)
    expect(set.duplicates).toEqual([]);
  });

  it.each(Object.entries(EXPECTED_DATA_ROWS))(
    "%s 시트 데이터행 수 = %i (분석문서·실측 일치)",
    (type, expected) => {
      const sheet = wb.sheets.find((s) => s.detection.type === (type as SheetType));
      expect(sheet, `시트 ${type} 미감지`).toBeDefined();
      expect(sheet!.dataRows.length).toBe(expected);
    },
  );

  it("매출상세 첫 데이터행에서 SKU 조인키·매출액 컬럼 추출", () => {
    const sales = wb.sheets.find((s) => s.detection.type === "매출상세")!;
    const rows = buildRawRows(sales);
    expect(rows.length).toBe(EXPECTED_DATA_ROWS.매출상세);
    // A열 = SKU키(계절연도-MC), 형식 "<연도숫자>-<코드>"
    expect(rows[0]!.skuKey).toMatch(/^\d{4,5}-/);
    // H열 = 실매출액(숫자)
    expect(typeof rows[0]!.data.H).toBe("number");
  });

  it("물류전체칸반 SKU 행은 RAW 가 아니므로 RAW 세트엔 미포함(곁가지 무시 확인)", () => {
    // 칸반·대시보드·#수식정리 등은 RAW SheetType 으로 잡히지 않아야.
    const rawTypes = new Set<string>([
      "매출상세",
      "점재고",
      "물류재고",
      "센터입출고",
      "기초재고_지점",
      "기초재고_센터",
    ]);
    const detectedRaw = wb.sheets.filter(
      (s) => s.detection.type && rawTypes.has(s.detection.type),
    );
    // 정확히 6개의 RAW 시트만.
    expect(detectedRaw.length).toBe(6);
  });
});
