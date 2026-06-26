/**
 * 업로드 1세트 시트 완전성 검증 (올오어낫싱).
 *
 * 근거: 아키텍처 §2-2 VALIDATE "시트존재·필수헤더 시그니처 …
 *       실패 → 422 + 어느 시트/헤더 누락인지 리포트(부분 성공 금지=올오어낫싱)".
 *
 * 멀티 업로드(여러 .xlsx) 또는 통합 1파일(여러 시트) 모두 수용 —
 * 감지된 SheetType 의 합집합이 REQUIRED_RAW_SHEETS 를 모두 덮는지 확인.
 */

import { type ParsedWorkbook } from "./parse-workbook";
import { REQUIRED_RAW_SHEETS, type SheetType } from "./sheet-types";

export interface SheetSetValidation {
  ok: boolean;
  /** 감지된 SheetType 들 */
  detected: SheetType[];
  /** 누락된 필수 RAW 시트 */
  missing: SheetType[];
  /** 같은 타입이 2개 이상 감지된 경우(모호) */
  duplicates: SheetType[];
}

export function validateSheetSet(
  workbooks: ReadonlyArray<ParsedWorkbook>,
): SheetSetValidation {
  const counts = new Map<SheetType, number>();
  for (const wb of workbooks) {
    for (const sheet of wb.sheets) {
      const t = sheet.detection.type;
      if (t === null) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const detected = [...counts.keys()];
  const missing = REQUIRED_RAW_SHEETS.filter((t) => !counts.has(t));
  const duplicates = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([t]) => t);

  return { ok: missing.length === 0, detected, missing, duplicates };
}
