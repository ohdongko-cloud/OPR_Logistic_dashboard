/**
 * 업로드 파일 1세트 → 스테이징 결과(메모리) 오케스트레이터.
 *
 * 흐름(아키텍처 §2): VALIDATE(파일) → PARSE → DETECT → VALIDATE(시트세트)
 *                    → buildRawRows → IngestResult(report)
 *
 * ⚠️ DB 적용은 이 함수 밖(라우트)에서. 여기선 "적재 구조체 + 검증 리포트"만 생성 —
 *    Neon 미구성 단계에서도 실파일로 end-to-end 검증 가능.
 */

import { buildRawRows, parseWorkbook, type RawRowRecord } from "./parse-workbook";
import { type SheetType } from "./sheet-types";
import {
  MAX_TOTAL_BYTES,
  validateFileMeta,
  validateMagic,
  validateTotalSize,
  type FileValidationError,
} from "./validate";
import { validateSheetSet, type SheetSetValidation } from "./validate-sheetset";

export interface UploadFileInput {
  name: string;
  size: number;
  /** 파일 바이트(서버에서 arrayBuffer 로 읽어 전달). */
  bytes: Uint8Array;
}

export interface FileReport {
  name: string;
  ok: boolean;
  error?: FileValidationError | "parse_error";
  detail?: string;
  /** 이 파일에서 감지된 시트들 */
  sheets: Array<{
    sheetName: string;
    type: SheetType | null;
    confidence: number;
    dataRows: number;
  }>;
}

export interface IngestResult {
  ok: boolean;
  files: FileReport[];
  sheetSet: SheetSetValidation;
  /** SheetType 별 적재 구조체(메모리). DB stage 입력. */
  records: Partial<Record<SheetType, RawRowRecord[]>>;
  /** 전체 RawRow 건수 */
  totalRows: number;
  /** 차단 사유(있으면) */
  blockedReason?: string;
}

export interface IngestOptions {
  maxRows?: number;
}

export function ingestFiles(
  files: ReadonlyArray<UploadFileInput>,
  opts: IngestOptions = {},
): IngestResult {
  const fileReports: FileReport[] = [];
  const workbooks = [];
  const records: Partial<Record<SheetType, RawRowRecord[]>> = {};
  let totalRows = 0;

  // 0) 총량 가드(올오어낫싱 — 초과 시 전부 차단).
  const totalCheck = validateTotalSize(files);
  if (!totalCheck.ok) {
    return {
      ok: false,
      files: [],
      sheetSet: { ok: false, detected: [], missing: [], duplicates: [] },
      records: {},
      totalRows: 0,
      blockedReason:
        totalCheck.detail ??
        `총 업로드 상한 ${MAX_TOTAL_BYTES / 1024 / 1024}MB 초과`,
    };
  }

  for (const f of files) {
    // 1) 파일 메타 검증
    const meta = validateFileMeta(f);
    if (!meta.ok) {
      fileReports.push({
        name: f.name,
        ok: false,
        error: meta.reason,
        detail: meta.detail,
        sheets: [],
      });
      continue;
    }
    // 2) 매직바이트
    const magic = validateMagic(f.bytes.slice(0, 4));
    if (!magic.ok) {
      fileReports.push({
        name: f.name,
        ok: false,
        error: magic.reason,
        detail: magic.detail,
        sheets: [],
      });
      continue;
    }
    // 3) 파싱 + 감지
    try {
      const wb = parseWorkbook(f.bytes, { maxRows: opts.maxRows });
      workbooks.push(wb);
      fileReports.push({
        name: f.name,
        ok: true,
        sheets: wb.sheets.map((s) => ({
          sheetName: s.name,
          type: s.detection.type,
          confidence: s.detection.confidence,
          dataRows: s.dataRows.length,
        })),
      });
      // 4) 적재 구조체 누적
      for (const s of wb.sheets) {
        if (s.detection.type === null) continue;
        const recs = buildRawRows(s);
        records[s.detection.type] = (records[s.detection.type] ?? []).concat(recs);
        totalRows += recs.length;
      }
    } catch (e) {
      fileReports.push({
        name: f.name,
        ok: false,
        error: "parse_error",
        detail: e instanceof Error ? e.message : String(e),
        sheets: [],
      });
    }
  }

  // 5) 시트 세트 완전성(올오어낫싱)
  const sheetSet = validateSheetSet(workbooks);
  const allFilesOk = fileReports.every((r) => r.ok);
  const ok = allFilesOk && sheetSet.ok;

  return {
    ok,
    files: fileReports,
    sheetSet,
    records,
    totalRows,
    blockedReason: ok
      ? undefined
      : !allFilesOk
        ? "일부 파일 검증/파싱 실패"
        : `필수 RAW 시트 누락: ${sheetSet.missing.join(", ")}`,
  };
}
