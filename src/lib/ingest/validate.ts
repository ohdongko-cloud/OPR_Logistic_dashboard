/**
 * 업로드 파일 검증 — 파일 안전성(magic·크기·확장자).
 *
 * 근거: 아키텍처 §2-2 VALIDATE "magic byte PK\x03\x04 · 확장자 · 50MB/100MB"
 *       (참조앱 validate.ts 패턴 차용 — 코드 복사 아님, 도메인 재작성).
 * 내용 검증(시트 존재·헤더 시그니처)은 parse-workbook 단계에서.
 */

export const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB

/** xlsx = ZIP 컨테이너 → "PK\x03\x04" */
const XLSX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

export type FileValidationError =
  | "empty"
  | "too_large"
  | "bad_extension"
  | "bad_magic";

export interface FileValidationResult {
  ok: boolean;
  reason?: FileValidationError;
  detail?: string;
}

export function validateFileMeta(file: {
  name: string;
  size: number;
}): FileValidationResult {
  if (file.size === 0) return { ok: false, reason: "empty", detail: "빈 파일" };
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      detail: `파일 ${(file.size / 1024 / 1024).toFixed(1)}MB > 상한 50MB`,
    };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      reason: "bad_extension",
      detail: ".xlsx 파일만 허용됩니다.",
    };
  }
  return { ok: true };
}

export function validateMagic(head: Uint8Array): FileValidationResult {
  if (head.length < 4) {
    return { ok: false, reason: "bad_magic", detail: "헤더 4바이트 미만" };
  }
  for (let i = 0; i < 4; i++) {
    if (head[i] !== XLSX_MAGIC[i]) {
      return {
        ok: false,
        reason: "bad_magic",
        detail: "ZIP(xlsx) 매직바이트 불일치",
      };
    }
  }
  return { ok: true };
}

export function validateTotalSize(
  files: ReadonlyArray<{ size: number }>,
): FileValidationResult {
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      detail: `총 업로드 ${(total / 1024 / 1024).toFixed(1)}MB > 상한 100MB`,
    };
  }
  return { ok: true };
}
