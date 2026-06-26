/**
 * PPTX 주입 — 템플릿(마스킹)에 엔진 집계값을 채워 유효 .pptx 산출.
 *
 * 실파일 엔진 경유(엑셀 100% 검증된 rollup) → 산출 셀이 엔진 집계와 일치하는지 + OOXML 유효성.
 * 실데이터 파일/원본 템플릿은 로컬에만 존재 — 부재 시 skip(테스트 환경 안전).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildKanban,
  type KanbanRow,
} from "@/lib/engine";
import { ingestFiles } from "@/lib/ingest";
import {
  findTableRanges,
  getCellText,
} from "./table-xml";
import { injectSlide1, type InjectInput } from "./inject";
import {
  SLIDE1_COLS,
  SLIDE1_ROWS,
  formatPptCell,
} from "./slide1-map";
import { resolveNode } from "./resolve-nodes";

const DATA_DIR = process.env.OPR_DATA_DIR ?? "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";
const MONTH_FILE = "#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";
const TEMPLATE = path.resolve(process.cwd(), "assets/ppt-template.pptx");

function loadMonthKanban(): KanbanRow[] | null {
  const fp = path.join(DATA_DIR, MONTH_FILE);
  if (!existsSync(fp)) return null;
  const buf = readFileSync(fp);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = ingestFiles([{ name: MONTH_FILE, size: buf.byteLength, bytes }]);
  if (!ingest.ok) return null;
  return buildKanban({ records: ingest.records, anchors: { salesDays: 21, monthDays: 30, factor: 1.22 } });
}

const haveTemplate = existsSync(TEMPLATE);
const kanban = haveTemplate ? loadMonthKanban() : null;
const ready = haveTemplate && kanban != null;

describe.skipIf(!ready)("PPTX 슬라이드1 주입(실파일)", () => {
  let out: Uint8Array;
  let slide1Xml: string;

  function build() {
    if (out) return;
    const input: InjectInput = {
      templateBytes: new Uint8Array(readFileSync(TEMPLATE)),
      kanban: kanban!,
      periodLabel: "당월",
    };
    out = injectSlide1(input);
    const files = unzipSync(out);
    slide1Xml = new TextDecoder("utf-8").decode(files["ppt/slides/slide1.xml"]!);
  }

  it("유효 OOXML(.pptx zip)을 산출한다", () => {
    build();
    expect(out.byteLength).toBeGreaterThan(1000);
    const files = unzipSync(out); // 깨졌으면 throw
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(files["ppt/presentation.xml"]).toBeDefined();
    expect(files["ppt/slides/slide1.xml"]).toBeDefined();
    expect(files["ppt/slides/slide5.xml"]).toBeDefined(); // 5슬라이드 유지
  });

  it("전체 행(r04) 물류비 셀이 엔진 집계와 일치한다", () => {
    build();
    const t = findTableRanges(slide1Xml);
    const total = resolveNode(kanban!, SLIDE1_ROWS[0]!);
    const logiCol = SLIDE1_COLS.find((c) => c.field === "logiCost")!;
    const expected = formatPptCell(logiCol.scale, total.logiCost);
    expect(getCellText(slide1Xml, t, 4, logiCol.col)).toBe(expected);
  });

  it("매핑된 모든 셀(행×열)이 엔진 집계 포맷값과 일치한다", () => {
    build();
    const t = findTableRanges(slide1Xml);
    let checked = 0;
    for (const ref of SLIDE1_ROWS) {
      const fact = resolveNode(kanban!, ref);
      for (const col of SLIDE1_COLS) {
        const expected = formatPptCell(col.scale, fact[col.field] as number | null);
        const actual = getCellText(slide1Xml, t, ref.row, col.col);
        expect(actual, `r${ref.row}(${ref.label}) c${col.col}(${col.label})`).toBe(expected);
        checked++;
      }
    }
    // 30 데이터행 × 20 데이터열 = 600 셀.
    expect(checked).toBe(SLIDE1_ROWS.length * SLIDE1_COLS.length);
  });

  it("구조 라벨(전체·여성·물류비)은 주입 후에도 보존된다", () => {
    build();
    const t = findTableRanges(slide1Xml);
    expect(getCellText(slide1Xml, t, 4, 0)).toBe("전체");
    expect(getCellText(slide1Xml, t, 8, 0)).toBe("여성");
    expect(getCellText(slide1Xml, t, 2, 2)).toBe("금액"); // 헤더
  });
});
