/**
 * SheetJS 워크북 파싱 → 시트 감지 → RawRow 적재 구조체.
 *
 * 근거: 아키텍처 §2-2 PARSE "SheetJS read → sheet_to_json(header:1, raw 보존)" ·
 *       §2 STAGE "RawRow 대량 insert(sheet별)" · 실파일 r1~r7 구조.
 *       참조앱 xlsx.ts 패턴 차용(매크로/외부링크/행상한 방어) — 도메인 재작성.
 *
 * 출력은 "DB 미적용" 단계에서도 그대로 검증 가능한 순수 구조체.
 * 실제 Prisma 적재(createMany)는 DATABASE_URL 구성 후 stage 라우트에서.
 */

import * as XLSX from "xlsx";

import { detectSheetType, type DetectionResult } from "./detect";
import { isBlank, normalizeKey } from "./normalize";
import { type SheetType } from "./sheet-types";

export type CellValue = string | number | boolean | null;

/** 파싱된 시트 1개. */
export interface ParsedSheet {
  /** 원본 시트명 */
  name: string;
  /** 자동 판별 결과 */
  detection: DetectionResult;
  /** 헤더로 쓰인 상단 행들(r1~headerRows, 정규화 전 원본) */
  headerRows: CellValue[][];
  /** 데이터 행들(총계행·헤더 제외, 셀값 원형) */
  dataRows: CellValue[][];
  /** 원본 워크북 기준 데이터 시작 행(1-based) */
  dataStartRow: number;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  /** 데이터로 볼 수 없어 무시한 시트명 */
  ignored: string[];
}

/** RawRow 적재용 구조체(Prisma RawRow 모델과 정합). */
export interface RawRowRecord {
  sheetType: SheetType;
  /** 시트 내 데이터행 0-based 인덱스 */
  rowIndex: number;
  /** 조인키(A열 SKU = 계절연도-MC자재그룹), 정규화. 없으면 "" */
  skuKey: string;
  /** 컬럼문자(A,B,…) → 셀값 맵(원행 그대로) */
  data: Record<string, CellValue>;
}

const MAX_ROWS_PER_SHEET = 50_000;
/** RAW 탭에서 헤더로 스캔할 상단 행 수(r1~r6). */
const HEADER_SCAN_ROWS = 6;

export interface ParseOptions {
  maxRows?: number;
}

export function parseWorkbook(
  buffer: ArrayBuffer | Uint8Array,
  opts: ParseOptions = {},
): ParsedWorkbook {
  const maxRows = opts.maxRows ?? MAX_ROWS_PER_SHEET;

  const wb = XLSX.read(buffer, {
    type: "array",
    dense: false,
    cellDates: true,
    cellFormula: false, // 값만(수식 무시) — 아키텍처 §2-2 cellFormula:false
    cellText: false,
  });

  // 보안: 매크로 워크북 거부 (아키텍처 §2-2 "매크로/외부링크 차단")
  const wbProps = wb.Workbook?.WBProps as { codeName?: string } | undefined;
  if (wbProps?.codeName) {
    throw new Error("매크로(.xlsm) 워크북은 허용되지 않습니다.");
  }
  const extLinks = (wb.Workbook as unknown as { ExtLinks?: unknown[] })?.ExtLinks;
  if (Array.isArray(extLinks) && extLinks.length > 0) {
    throw new Error("외부 링크가 포함된 워크북은 허용되지 않습니다.");
  }

  const sheets: ParsedSheet[] = [];
  const ignored: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // OOM 사전 차단 — sheet_to_json 전에 ref 로 선언 행 수 확인.
    const ref = ws["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      const declaredRows = range.e.r - range.s.r + 1;
      if (declaredRows > maxRows) {
        throw new Error(
          `시트 '${sheetName}' 행 수 ${declaredRows} > 상한 ${maxRows}`,
        );
      }
    }

    const aoa = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: null,
      raw: true, // 숫자는 number 로 보존(금액·수량 집계용)
      blankrows: false,
    });

    if (aoa.length > maxRows) {
      throw new Error(
        `시트 '${sheetName}' 실제 행 수 ${aoa.length} > 상한 ${maxRows}`,
      );
    }

    const headerRows = aoa.slice(0, HEADER_SCAN_ROWS).map((r) => r ?? []);
    const detection = detectSheetType(headerRows, sheetName);

    // 데이터 시작 행 결정: 판별된 시그니처의 dataStartRow, 없으면 헤더추정.
    const dataStartRow = resolveDataStart(aoa, detection.type);

    const dataRows = aoa
      .slice(dataStartRow - 1)
      .filter((r) => r.some((c) => !isBlank(c)));

    // 데이터·판별 모두 없으면 무시(참조탭·숨김 곁가지).
    if (detection.type === null && dataRows.length === 0) {
      ignored.push(sheetName);
      continue;
    }

    sheets.push({ name: sheetName, detection, headerRows, dataRows, dataStartRow });
  }

  return { sheets, ignored };
}

/** SheetType 별 dataStartRow(RAW 탭=7, 마스터=헤더 다음). */
function resolveDataStart(aoa: CellValue[][], type: SheetType | null): number {
  // RAW 6탭은 r7 부터(총계행 r6 다음). 실측 핀고정.
  const RAW_TYPES: SheetType[] = [
    "매출상세",
    "점재고",
    "물류재고",
    "센터입출고",
    "기초재고_지점",
    "기초재고_센터",
  ];
  if (type && RAW_TYPES.includes(type)) return 7;

  // 그 외(마스터·물류비예측): 비어있지 않은 셀 5개 이상인 첫 행을 헤더로, 그 다음을 데이터로.
  for (let i = 0; i < aoa.length; i++) {
    const nonEmpty = (aoa[i] ?? []).filter((c) => !isBlank(c)).length;
    if (nonEmpty >= 5) return i + 2; // (i 0-based 헤더) → 데이터는 i+2 행(1-based)
  }
  return 1;
}

/** 0-based 컬럼 인덱스 → 엑셀 컬럼문자(A, B, …, AA, …). */
export function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** ParsedSheet → RawRow 적재 구조체 배열. */
export function buildRawRows(sheet: ParsedSheet): RawRowRecord[] {
  const type = sheet.detection.type;
  if (type === null) return [];

  return sheet.dataRows.map((row, rowIndex) => {
    const data: Record<string, CellValue> = {};
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (isBlank(v)) continue;
      data[colLetter(c)] = v ?? null;
    }
    const skuKey = normalizeKey(row[0]);
    return { sheetType: type, rowIndex, skuKey, data };
  });
}
