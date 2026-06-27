/**
 * 업로드 양식 템플릿 .xlsx 생성기 (SheetJS).
 *
 * template-spec.ts(단일 진실원)를 읽어 파일종류별(아이템/매장) 워크북을 만든다.
 *  - 맨 앞 README(안내) 시트: 시트별·핵심열별 의미·주의(한국어).
 *  - 각 RAW 시트: 헤더를 **정확한 열 위치**(파서 기대 좌표)에 배치 + 예시 1행(회색 안내).
 *  - 데이터행 비움(헤더·안내·예시 더미만 — 실데이터 0).
 *
 * 보안: 실수치/실명 미포함. 매크로/외부링크 없음(plain .xlsx).
 */

import * as XLSX from "xlsx";

import {
  getTemplateDef,
  type TemplateDef,
  type TemplateKind,
  type TemplateSheet,
} from "./template-spec";

/** 'A'→0, 'B'→1, …, 'AA'→26. */
function colIndexFromLetter(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

type CellMatrix = (string | number | null)[][];

/** 빈 행렬을 (rows × cols) 로 확장(부족분 null 채움). */
function ensure(matrix: CellMatrix, r: number, c: number): void {
  while (matrix.length <= r) matrix.push([]);
  const row = matrix[r]!;
  while (row.length <= c) row.push(null);
}

function setCell(matrix: CellMatrix, row1: number, col: string, value: string | number): void {
  const r = row1 - 1;
  const c = colIndexFromLetter(col);
  ensure(matrix, r, c);
  matrix[r]![c] = value;
}

/** 한 시트 정의 → AOA(행:셀배열). 헤더·상단보조행·예시행만. */
function sheetToAoa(sheet: TemplateSheet): CellMatrix {
  const m: CellMatrix = [];

  // 상단 보조행(아이템 RAW r1 리포트명·r5 차원라벨 등 — 파서 시그니처).
  if (sheet.topRows) {
    for (const [rowStr, cells] of Object.entries(sheet.topRows)) {
      const row1 = Number(rowStr);
      for (const [col, text] of Object.entries(cells)) setCell(m, row1, col, text);
    }
  }

  // 헤더행 — 정확한 열 위치에 한국어 라벨.
  for (const c of sheet.columns) setCell(m, sheet.headerRow, c.col, c.header);

  // 예시 안내행 1줄(회색 — 실데이터 아님).
  for (const c of sheet.columns) {
    if (c.example !== undefined) setCell(m, sheet.dataStartRow, c.col, c.example);
  }

  // 빈 셀을 null 로 정렬(SheetJS 가 sparse 처리하므로 그대로 OK).
  return m;
}

/** README(안내) 시트 AOA. 시트별·핵심열별 의미·주의 한국어. */
function readmeAoa(def: TemplateDef): CellMatrix {
  const rows: CellMatrix = [];
  rows.push([def.title]);
  rows.push([def.guide]);
  rows.push([]);
  rows.push(["■ 작성 규칙"]);
  rows.push(["1) 아래 각 시트의 헤더 행은 파서가 기대하는 정확한 열 위치입니다. 헤더 위치를 옮기지 마세요."]);
  rows.push(["2) 데이터는 각 시트의 데이터 시작행부터 채우세요(아이템 RAW=7행, 매장 RAW=7행, 수불오차=5행)."]);
  rows.push(["3) 회색 예시행은 형식 참고용 더미입니다 — 실제 업로드 전에 지우거나 실값으로 교체하세요."]);
  rows.push(["4) 빈 열은 그대로 비워도 됩니다(파서는 표시된 열만 읽습니다)."]);
  rows.push([]);
  rows.push(["■ 시트·핵심열 안내"]);
  rows.push(["시트", "열", "헤더", "의미·주의"]);

  for (const sheet of def.sheets) {
    rows.push([sheet.name, "", "", sheet.desc]);
    for (const c of sheet.columns) {
      if (!c.key && !c.note) continue; // 핵심열·주의 있는 열만 안내(나머지는 헤더로 자명).
      rows.push([
        "",
        c.col,
        c.header + (c.key ? " ★핵심" : ""),
        c.note ?? "",
      ]);
    }
    rows.push([]);
  }
  return rows;
}

/**
 * 파일종류별 템플릿 워크북 바이트(.xlsx) 생성.
 * @param kind "item" | "store"
 * @returns Uint8Array (.xlsx) — null 이면 미지원 kind.
 */
export function buildTemplateWorkbook(kind: TemplateKind): Uint8Array | null {
  const def = getTemplateDef(kind);
  if (!def) return null;

  const wb = XLSX.utils.book_new();

  // README(안내) 시트를 맨 앞에.
  const readme = XLSX.utils.aoa_to_sheet(readmeAoa(def));
  readme["!cols"] = [{ wch: 16 }, { wch: 6 }, { wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, readme, "README(안내)");

  for (const sheet of def.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheetToAoa(sheet));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}

/** 다운로드 파일명. */
export function templateFileName(kind: TemplateKind): string {
  return kind === "item"
    ? "OPR_업로드양식_아이템.xlsx"
    : "OPR_업로드양식_매장.xlsx";
}
