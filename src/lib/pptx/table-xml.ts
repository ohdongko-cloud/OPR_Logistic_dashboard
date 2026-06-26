/**
 * OOXML 표(<a:tbl>) 셀 텍스트 surgery — **서식 보존** 주입.
 *
 * 전략: 풀 DOM 직렬화는 네임스페이스·속성순서를 흐트려 OOXML을 깨뜨릴 수 있으므로,
 *       원본 바이트를 그대로 두고 **각 셀의 첫 <a:t>…</a:t> 텍스트만** 치환한다.
 *       (데이터 셀 = 정확히 1개 텍스트런 — 원본 slide1 실측). rPr/tcPr 등 서식 전부 불변.
 *
 * 좌표(오프셋)는 스냅샷 기준 → 치환 후엔 어긋나므로, **치환마다 호출자가 재파싱**한다
 * (셀 1건 치환 = O(표크기) 스캔이지만 슬라이드1 표는 35×26 → 충분히 저렴).
 *
 * 주의: 첫 <a:tbl> 1개만 대상(슬라이드1 = 표 1개). 중첩 표 없음(실측).
 */

export interface CellRange {
  /** 셀(<a:tc>) 시작·끝(태그 포함) 오프셋. */
  start: number;
  end: number;
}

export interface RowRange {
  start: number;
  end: number;
  cells: CellRange[];
}

export interface TableRanges {
  /** 표(<a:tbl>) 전체 오프셋. */
  tblStart: number;
  tblEnd: number;
  rows: RowRange[];
}

/** 여는/닫는 태그를 균형 스캔해 첫 `<tag …>…</tag>` 의 [start,end) 반환. start 는 검색 시작. */
function matchBalanced(xml: string, tag: string, from: number): { start: number; end: number } | null {
  const open = new RegExp(`<a:${tag}(?:\\s[^>]*)?>`, "g");
  open.lastIndex = from;
  const m = open.exec(xml);
  if (!m) return null;
  const start = m.index;
  const openTag = new RegExp(`<a:${tag}(?:\\s[^>]*)?>`, "g");
  const closeTag = new RegExp(`</a:${tag}>`, "g");
  let depth = 1;
  let pos = open.lastIndex;
  while (depth > 0) {
    openTag.lastIndex = pos;
    closeTag.lastIndex = pos;
    const o = openTag.exec(xml);
    const c = closeTag.exec(xml);
    if (!c) return null; // 비정상
    if (o && o.index < c.index) {
      depth++;
      pos = o.index + o[0].length;
    } else {
      depth--;
      pos = c.index + c[0].length;
    }
  }
  return { start, end: pos };
}

/** 첫 <a:tbl> 의 행·셀 범위를 파싱. */
export function findTableRanges(xml: string): TableRanges {
  const tbl = matchBalanced(xml, "tbl", 0);
  if (!tbl) {
    throw new Error("표(<a:tbl>)를 찾을 수 없습니다.");
  }
  const rows: RowRange[] = [];
  let cursor = tbl.start;
  // tblGrid 안에는 tr 가 없음 → 표 범위 내에서 tr 만 순차 스캔.
  for (;;) {
    const tr = matchBalanced(xml, "tr", cursor);
    if (!tr || tr.start >= tbl.end) break;
    const cells: CellRange[] = [];
    let cc = tr.start;
    for (;;) {
      const tc = matchBalanced(xml, "tc", cc);
      if (!tc || tc.start >= tr.end) break;
      cells.push({ start: tc.start, end: tc.end });
      cc = tc.end;
    }
    rows.push({ start: tr.start, end: tr.end, cells });
    cursor = tr.end;
  }
  return { tblStart: tbl.start, tblEnd: tbl.end, rows };
}

const T_RE = /<a:t>([\s\S]*?)<\/a:t>/;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** (row,col) 셀의 첫 텍스트런 값. 런 없으면 "". */
export function getCellText(xml: string, t: TableRanges, row: number, col: number): string {
  const cell = t.rows[row]?.cells[col];
  if (!cell) throw new Error(`셀(${row},${col}) 범위 없음`);
  const slice = xml.slice(cell.start, cell.end);
  const m = T_RE.exec(slice);
  return m ? unescapeXml(m[1]!) : "";
}

export interface SetOpts {
  /** 런이 없는 빈 셀이면 새 런을 만들지 않고 원본 그대로 반환(주입 대상 아님). */
  skipIfNoRun?: boolean;
}

/**
 * (row,col) 셀의 첫 텍스트런 값을 치환(서식 보존). 새 xml 문자열 반환.
 * 치환 후 좌표가 변하므로 후속 작업은 재파싱(findTableRanges) 필요.
 */
export function setCellText(
  xml: string,
  t: TableRanges,
  row: number,
  col: number,
  value: string,
  opts: SetOpts = {},
): string {
  const cell = t.rows[row]?.cells[col];
  if (!cell) throw new Error(`셀(${row},${col}) 범위 없음`);
  const slice = xml.slice(cell.start, cell.end);
  const m = T_RE.exec(slice);
  if (!m) {
    if (opts.skipIfNoRun) return xml; // 빈 셀 — 무시
    throw new Error(`셀(${row},${col})에 텍스트런(<a:t>)이 없습니다.`);
  }
  const newSlice =
    slice.slice(0, m.index) + `<a:t>${escapeXml(value)}</a:t>` + slice.slice(m.index + m[0].length);
  return xml.slice(0, cell.start) + newSlice + xml.slice(cell.end);
}
