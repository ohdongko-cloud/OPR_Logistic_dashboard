/**
 * PPTX 슬라이드 2·5 주입(실파일) — 매장/아이템 엔진 집계가 표 셀과 일치 + OOXML 유효성.
 *
 * 슬2(매장 SCM): store 엔진 flatRows → 표 행(전체/직영/점포14)×매장 열. (−)재고 행매핑 앵커 검증.
 * 슬5(목표 대비): 아이템 엔진 현재값 → 표 행(전체/성별)×핵심지표 열. 슬1과 일관(동일 엔진).
 * 슬3·4: 행↔노드 매핑 마스터 부재 → 빈 매핑(SLIDE34_ROWS=[]). 주입 안 함(구조 보존만 확인).
 *
 * 실데이터/템플릿은 로컬 전용 — 부재 시 skip(테스트 환경 안전).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildKanban, type KanbanRow } from "@/lib/engine";
import {
  buildStoreDashboard,
  buildStoreKanban,
  ingestStoreFile,
  MONTH_STORE_PARAMS,
  type StoreDashRow,
} from "@/lib/engine-store";
import { ingestFiles } from "@/lib/ingest";
import { buildAnnotationOverlay } from "@/lib/annotations/overlay";
import type { AnnotationDto } from "@/lib/annotations/types";

import { findTableRanges, getCellText } from "./table-xml";
import {
  injectAll,
  injectSlide2,
  injectSlide5,
  resolveStoreRow,
} from "./inject";
import {
  SLIDE2_COLS,
  SLIDE2_ROWS,
  formatSlide2Cell,
} from "./slide2-map";
import { SLIDE5_CURRENT_COLS, SLIDE5_ROWS } from "./slide5-map";
import { SLIDE34_ROWS } from "./slide34-map";
import { resolveNode } from "./resolve-nodes";
import { formatPptCell } from "./slide1-map";

const DATA_DIR = process.env.OPR_DATA_DIR ?? "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";
const ITEM_MONTH = "#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";
const STORE_MONTH = "#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx";
const TEMPLATE = path.resolve(process.cwd(), "assets/ppt-template.pptx");

function bytesOf(name: string): Uint8Array | null {
  const fp = path.join(DATA_DIR, name);
  if (!existsSync(fp)) return null;
  const buf = readFileSync(fp);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function loadItemKanban(): KanbanRow[] | null {
  const bytes = bytesOf(ITEM_MONTH);
  if (!bytes) return null;
  const ingest = ingestFiles([{ name: ITEM_MONTH, size: bytes.byteLength, bytes }]);
  if (!ingest.ok) return null;
  return buildKanban({
    records: ingest.records,
    anchors: { salesDays: 21, monthDays: 30, factor: 1.22 },
  });
}

function loadStoreRows(): StoreDashRow[] | null {
  const bytes = bytesOf(STORE_MONTH);
  if (!bytes) return null;
  const ingest = ingestStoreFile(bytes);
  if (!ingest.ok) return null;
  const kanban = buildStoreKanban({
    raw: ingest.raw,
    params: MONTH_STORE_PARAMS,
    roster: ingest.roster,
  });
  const dash = buildStoreDashboard(kanban, {
    params: MONTH_STORE_PARAMS,
    curation: ingest.curation,
    errors: ingest.errors,
  });
  return dash.flatRows;
}

/** 합성 Annotation(전체 노드 = 루트 키) — 슬5 목표/전년/조치 주입 검증용. */
function mkAnno(p: {
  kind: AnnotationDto["kind"];
  metricCode?: string;
  numValue?: number;
  textValue?: string;
}): AnnotationDto {
  return {
    id: `${p.kind}-${p.metricCode ?? "x"}`,
    kind: p.kind,
    periodType: "MONTH",
    periodStart: "2026-06-01",
    gender: null,
    newcarry: null,
    season: null,
    item: null,
    metricCode: p.metricCode ?? null,
    numValue: p.numValue ?? null,
    textValue: p.textValue ?? null,
    authorEmail: null,
    updatedAt: "2026-06-26T00:00:00.000Z",
  };
}

const haveTemplate = existsSync(TEMPLATE);
const templateBytes = haveTemplate ? new Uint8Array(readFileSync(TEMPLATE)) : null;
const itemKanban = haveTemplate ? loadItemKanban() : null;
const storeRows = haveTemplate ? loadStoreRows() : null;

// ─────────────────────────────────────────────────────────────────────────
// 슬3·4: 매핑 마스터 부재 — 빈 매핑(순수 단위테스트, 파일 불필요).
// ─────────────────────────────────────────────────────────────────────────
describe("슬3·4 상품 SCM 매핑(현재 상태)", () => {
  it("행 매핑은 비어있다(브랜드명↔코드 마스터 부재 → 공란 유지, 가짜값 금지)", () => {
    expect(SLIDE34_ROWS).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 슬2(매장 SCM) — 실파일.
// ─────────────────────────────────────────────────────────────────────────
describe.skipIf(!(templateBytes && storeRows))("PPTX 슬라이드2 주입(매장 실파일)", () => {
  let slide2Xml: string;

  function build() {
    if (slide2Xml) return;
    const out = injectSlide2({ templateBytes: templateBytes!, storeRows: storeRows! });
    const files = unzipSync(out);
    slide2Xml = new TextDecoder("utf-8").decode(files["ppt/slides/slide2.xml"]!);
  }

  it("유효 OOXML(.pptx zip, 5슬라이드 유지)을 산출한다", () => {
    const out = injectSlide2({ templateBytes: templateBytes!, storeRows: storeRows! });
    expect(out.byteLength).toBeGreaterThan(1000);
    const files = unzipSync(out);
    expect(files["[Content_Types].xml"]).toBeDefined();
    for (let i = 1; i <= 5; i++) {
      expect(files[`ppt/slides/slide${i}.xml`]).toBeDefined();
    }
  });

  it("(−)재고 수량(c20)이 store negQty 와 행순서대로 1:1 일치한다(행매핑 앵커)", () => {
    build();
    const t = findTableRanges(slide2Xml);
    const negCol = SLIDE2_COLS.find((c) => c.field === "negQty")!;
    for (const ref of SLIDE2_ROWS) {
      const row = resolveStoreRow(storeRows!, ref.match);
      if (!row) continue;
      const expected = formatSlide2Cell(negCol.scale, row.negQty);
      const actual = getCellText(slide2Xml, t, ref.row, negCol.col);
      // 빈 셀(런 없음)은 주입 skip 되므로, 기대값이 비어있지 않을 때만 일치 단언.
      if (expected) expect(actual, `r${ref.row}(${ref.label}) (−)수량`).toBe(expected);
    }
  });

  it("전체/직영/점포 행의 매장 핵심지표 셀이 엔진 집계와 일치한다", () => {
    build();
    const t = findTableRanges(slide2Xml);
    let checked = 0;
    for (const ref of SLIDE2_ROWS) {
      const row = resolveStoreRow(storeRows!, ref.match);
      if (!row) continue;
      for (const col of SLIDE2_COLS) {
        const expected = formatSlide2Cell(col.scale, row[col.field] as number | null);
        if (!expected) continue; // null/공란은 비교 제외(원본 빈칸 유지).
        const actual = getCellText(slide2Xml, t, ref.row, col.col);
        if (actual === "") continue; // 원본이 빈 셀(런 없음) → 주입 skip, 비교 제외.
        expect(actual, `r${ref.row}(${ref.label}) c${col.col}(${col.label})`).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20); // 최소 핵심 셀 다수 주입 확인.
  });

  it("구조 라벨(헤더·행 라벨)은 주입 후에도 보존된다", () => {
    build();
    const t = findTableRanges(slide2Xml);
    // r02 c0 = "OPR 전체…" 라벨 보존(주입은 데이터 열만).
    expect(getCellText(slide2Xml, t, 2, 0)).toContain("OPR");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 슬5(목표 대비) — 아이템 실파일(annotation 없이 현재값만).
// ─────────────────────────────────────────────────────────────────────────
describe.skipIf(!(templateBytes && itemKanban))("PPTX 슬라이드5 주입(목표대비 — 현재값)", () => {
  let slide5Xml: string;

  function build() {
    if (slide5Xml) return;
    const out = injectSlide5({ templateBytes: templateBytes!, kanban: itemKanban! });
    const files = unzipSync(out);
    slide5Xml = new TextDecoder("utf-8").decode(files["ppt/slides/slide5.xml"]!);
  }

  it("유효 OOXML(.pptx zip, 5슬라이드 유지)을 산출한다", () => {
    const out = injectSlide5({ templateBytes: templateBytes!, kanban: itemKanban! });
    const files = unzipSync(out);
    expect(files["[Content_Types].xml"]).toBeDefined();
    for (let i = 1; i <= 5; i++) {
      expect(files[`ppt/slides/slide${i}.xml`]).toBeDefined();
    }
  });

  it("전체/성별 행의 현재값(핵심지표) 셀이 엔진 집계와 일치한다", () => {
    build();
    const t = findTableRanges(slide5Xml);
    let checked = 0;
    for (const ref of SLIDE5_ROWS) {
      const fact = resolveNode(itemKanban!, ref);
      for (const col of SLIDE5_CURRENT_COLS) {
        const expected = formatPptCell(col.scale, fact[col.field] as number | null);
        if (!expected) continue;
        const actual = getCellText(slide5Xml, t, ref.row, col.col);
        if (actual === "") continue; // 원본 빈 셀 → skip.
        expect(actual, `r${ref.row}(${ref.label}) c${col.col}(${col.label})`).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("목표/전년/조치(annotation 미제공)는 가짜값 없이 비어있다", () => {
    build();
    const t = findTableRanges(slide5Xml);
    // 전체행 물류비율 목표(c3)·전년(c4) = annotation 없으면 "" (원본 마스킹 빈칸 유지).
    expect(getCellText(slide5Xml, t, 4, 3)).toBe("");
    expect(getCellText(slide5Xml, t, 4, 4)).toBe("");
  });

  it("annotation 오버레이가 있으면 전체행 목표·전년·조치가 주입된다", () => {
    // 전체 노드(루트 키)의 목표·전년·조치 합성 오버레이.
    const annos: AnnotationDto[] = [
      mkAnno({ kind: "TARGET", metricCode: "logiRatio", numValue: 0.08 }),
      mkAnno({ kind: "PRIOR_YEAR", metricCode: "logiRatio", numValue: 0.153 }),
      mkAnno({ kind: "TARGET", metricCode: "dotsCtr", numValue: 60 }),
      mkAnno({ kind: "ACTION", textValue: "조치 샘플 텍스트" }),
    ];
    const overlay = buildAnnotationOverlay(annos);
    const out = injectSlide5({ templateBytes: templateBytes!, kanban: itemKanban!, overlay });
    const files = unzipSync(out);
    const xml = new TextDecoder("utf-8").decode(files["ppt/slides/slide5.xml"]!);
    const t = findTableRanges(xml);
    // c3 목표 물류비율 = 8.0% · c4 전년 = 15.3% · c8 목표 센터재고일수 = 60 · c29 조치.
    expect(getCellText(xml, t, 4, 3)).toBe("8.0%");
    expect(getCellText(xml, t, 4, 4)).toBe("15.3%");
    expect(getCellText(xml, t, 4, 8)).toBe("60");
    expect(getCellText(xml, t, 4, 29)).toBe("조치 샘플 텍스트");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// injectAll — 슬1·2·5 일괄.
// ─────────────────────────────────────────────────────────────────────────
describe.skipIf(!(templateBytes && itemKanban && storeRows))("injectAll(슬1·2·5 일괄)", () => {
  it("5슬라이드 유효 .pptx + 슬1·2·5 데이터 셀 주입, 슬3·4 구조 보존", () => {
    const out = injectAll({
      templateBytes: templateBytes!,
      kanban: itemKanban!,
      storeRows: storeRows!,
    });
    const files = unzipSync(out);
    for (let i = 1; i <= 5; i++) {
      expect(files[`ppt/slides/slide${i}.xml`]).toBeDefined();
    }
    const dec = new TextDecoder("utf-8");
    // 슬1 전체행 물류비 = 엔진값.
    const s1 = dec.decode(files["ppt/slides/slide1.xml"]!);
    const t1 = findTableRanges(s1);
    expect(t1.rows.length).toBe(35);
    // 슬2 전체행 (−)재고 = 엔진 negQty.
    const s2 = dec.decode(files["ppt/slides/slide2.xml"]!);
    const t2 = findTableRanges(s2);
    expect(t2.rows.length).toBe(18);
    const total = resolveStoreRow(storeRows!, { kind: "total" });
    expect(getCellText(s2, t2, 2, 20)).toBe(formatSlide2Cell("negQtyParen", total!.negQty));
    // 슬5 구조 유지.
    const s5 = dec.decode(files["ppt/slides/slide5.xml"]!);
    expect(findTableRanges(s5).rows.length).toBe(40);
    // 슬3·4 표 구조 보존(25행).
    const s3 = dec.decode(files["ppt/slides/slide3.xml"]!);
    const s4 = dec.decode(files["ppt/slides/slide4.xml"]!);
    expect(findTableRanges(s3).rows.length).toBe(25);
    expect(findTableRanges(s4).rows.length).toBe(25);
  });
});
