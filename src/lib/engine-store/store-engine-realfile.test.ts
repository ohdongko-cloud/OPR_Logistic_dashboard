/**
 * 매장 엔진 ↔ 엑셀 실측값 셀단위 대조 (증거 테스트 — 핵심).
 *
 * ⚠️ 실데이터 파일은 레포에 복사·커밋하지 않는다(보안). 절대경로 "참조만".
 *    파일 부재 시 skip(CI 안전). 산출 수치도 커밋하지 않음(테스트가 xlsx 직접 대조).
 *
 * 2단계 검증(spec 매장 §7):
 *   Stage1 = 매장 엔진 칸반 ↔ 엑셀 `매장전체칸반(당월)` 캐시값
 *            (점포행 R13~43 + 채널행 R9~11 + 전체행 R8, 35열)
 *   Stage2 = 매장 엔진 대시보드 ↔ 엑셀 `※지점대시보드` 캐시값
 *            (집계행 R4~7 + 직영점 카드 R8~21, 데이터·파생·(−)재고열)
 *
 * ground truth = openpyxl/SheetJS 캐시값(엑셀이 저장한 마지막 계산값).
 * 부동소수 허용오차: |excel - ts| <= 1e-6 * (1 + |excel|).
 */

import { existsSync, readFileSync } from "node:fs";

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { ingestStoreFile } from "./ingest-store";
import { buildStoreKanban } from "./stage1-store-kanban";
import { buildStoreDashboard } from "./stage2-store-tree";
import { MONTH_STORE_PARAMS, type StoreKanbanRow } from "./types";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);

/** 부동소수 허용오차(상대+절대). */
function approxEq(excel: number, ts: number, tol = 1e-6): boolean {
  return Math.abs(excel - ts) <= tol * (1 + Math.abs(excel));
}

/** 엑셀 캐시 셀값(SheetJS cell.v). 빈/문자 → null(공란=파생 분모0 / IFERROR ""). */
function cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref];
  if (!c) return null;
  if (c.t === "n" && typeof c.v === "number") return c.v;
  if (c.v === "" || c.v === null || c.v === undefined) return null;
  if (typeof c.v === "number") return c.v;
  return null;
}

function cellStr(ws: XLSX.WorkSheet, ref: string): string {
  const c = ws[ref];
  if (!c || c.v === null || c.v === undefined) return "";
  return String(c.v).normalize("NFKC").trim();
}

describe.skipIf(!HAS_FILE)("매장 엔진 ↔ 엑셀 실측 대조 (당월 매장)", () => {
  const buf = HAS_FILE ? readFileSync(REAL_FILE) : Buffer.alloc(0);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  // ── ingest → 매장 엔진 ──
  const ingest = HAS_FILE ? ingestStoreFile(bytes) : null;
  const kanban: StoreKanbanRow[] = HAS_FILE
    ? buildStoreKanban({ raw: ingest!.raw, params: MONTH_STORE_PARAMS, roster: ingest!.roster })
    : [];
  const dashboard = HAS_FILE
    ? buildStoreDashboard(kanban, {
        params: MONTH_STORE_PARAMS,
        curation: ingest!.curation,
        errors: ingest!.errors,
      })
    : null;

  // ── 엑셀 캐시값 워크북(검증 ground truth) ──
  const wb = HAS_FILE
    ? XLSX.read(bytes, { type: "array", cellFormula: false, cellNF: false, cellText: false })
    : ({ SheetNames: [], Sheets: {} } as XLSX.WorkBook);
  const kbName = HAS_FILE ? wb.SheetNames.find((n) => n.includes("칸반"))! : "";
  const dbName = HAS_FILE ? wb.SheetNames.find((n) => n.includes("대시보드"))! : "";
  const kbWs = HAS_FILE ? wb.Sheets[kbName] : ({} as XLSX.WorkSheet);
  const dbWs = HAS_FILE ? wb.Sheets[dbName] : ({} as XLSX.WorkSheet);

  it("ingest 5 RAW 충족 + 점포 31개(직영14·중관10·기타7)", () => {
    expect(ingest!.ok).toBe(true);
    expect(kanban.length).toBe(31);
    expect(kanban.filter((k) => k.channel === "직영").length).toBe(14);
    expect(kanban.filter((k) => k.channel === "중간관리").length).toBe(10);
    expect(kanban.filter((k) => k.channel === "기타").length).toBe(7);
  });

  // 칸반 35열 → StoreKanbanRow 필드 매핑(letter → 엔진 필드).
  const KB_COLS: Array<[string, keyof StoreKanbanRow]> = [
    ["D", "saleMult"],
    ["E", "dotsFix"],
    ["F", "dotsAll"],
    ["G", "summerPct"],
    ["H", "inQtyFix"],
    ["I", "inAmtFix"],
    ["J", "retQtyFix"],
    ["K", "retAmtFix"],
    ["L", "saleQtyFix"],
    ["M", "saleAmtFix"],
    ["N", "cogsFix"],
    ["O", "dailyCogsFix"],
    ["P", "summerInvQty"],
    ["Q", "summerInvAmt"],
    ["R", "invQtyFix"],
    ["S", "invAmtFix"],
    ["T", "openQtyFix"],
    ["U", "openAmtFix"],
    ["V", "avgInvFix"],
    ["W", "inQtyAll"],
    ["X", "inAmtAll"],
    ["Y", "retQtyAll"],
    ["Z", "retAmtAll"],
    ["AA", "saleQtyAll"],
    ["AB", "saleAmtAll"],
    ["AC", "cogsAll"],
    ["AD", "dailyCogsAll"],
    ["AE", "invQtyAll"],
    ["AF", "invAmtAll"],
    ["AG", "openQtyAll"],
    ["AH", "openAmtAll"],
    ["AI", "avgInvAll"],
  ];

  /** 엑셀 칸반 점포코드 → 행번호(R13~43). */
  function excelStoreRow(): Map<string, number> {
    const m = new Map<string, number>();
    for (let r = 13; r <= 43; r++) {
      const code = cellStr(kbWs, `A${r}`);
      if (code) m.set(code, r);
    }
    return m;
  }

  it("Stage1: 칸반 점포행 35열 × 31점 셀단위 매치율 ≥ 99.5%", () => {
    const byCode = new Map<string, StoreKanbanRow>();
    for (const k of kanban) byCode.set(k.storeCode, k);
    const rowOf = excelStoreRow();

    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (const [code, r] of rowOf) {
      const k = byCode.get(code);
      if (!k) {
        fails.push(`점포 ${code}(엑셀행 ${r}) 엔진 미존재`);
        continue;
      }
      for (const [letter, field] of KB_COLS) {
        const ev = cellNum(kbWs, `${letter}${r}`);
        const tvRaw = k[field] as number | null;
        const isRatio = ["D", "E", "F", "G"].includes(letter);
        total++;
        if (ev === null) {
          // 엑셀 공란(IFERROR "") = null. 엔진 null 또는 0(데이터열) 매칭.
          if (tvRaw === null || tvRaw === 0) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${code}.${String(field)}): excel=공란 ts=${tvRaw}`);
          continue;
        }
        const tv = tvRaw === null ? (isRatio ? null : 0) : Number(tvRaw);
        if (tv === null) {
          if (approxEq(ev, 0, 1e-6)) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${code}.${String(field)}): excel=${ev} ts=null`);
          continue;
        }
        if (approxEq(ev, tv, 1e-4)) matched++;
        else if (fails.length < 30)
          fails.push(`${letter}${r}(${code}.${String(field)}): excel=${ev} ts=${tv}`);
      }
    }
    const rate = matched / total;
    console.log(
      `[매장 Stage1] 칸반 점포행 셀 매치 ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  실패표본:\n   ${fails.slice(0, 20).join("\n   ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.995);
  });

  it("Stage1: 채널행 R9~11(직영/중관/기타) + 전체 R8 SUMIF/SUM 정합 ≥ 99.5%", () => {
    // 채널/전체 행 = 엔진 dashboard 의 채널·전체 노드(데이터·파생 동형) 칸반과 대조.
    // 엔진 stage2 채널 노드 metrics(칸반 데이터열 동일 필드) ↔ 엑셀 칸반 R9~11/R8.
    const CHAN_ROWS: Array<[number, string]> = [
      [8, "전체"],
      [9, "직영"],
      [10, "중간관리"],
      [11, "기타"],
    ];
    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (const [r, label] of CHAN_ROWS) {
      const node =
        label === "전체"
          ? dashboard!.root
          : dashboard!.root.children.find((c) => c.label === label);
      if (!node) {
        fails.push(`채널노드 ${label} 엔진 미존재`);
        continue;
      }
      for (const [letter, field] of KB_COLS) {
        const ev = cellNum(kbWs, `${letter}${r}`);
        const tvRaw = node.kanban[field] as number | null;
        const isRatio = ["D", "E", "F", "G"].includes(letter);
        total++;
        if (ev === null) {
          if (tvRaw === null || tvRaw === 0) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${label}.${String(field)}): excel=공란 ts=${tvRaw}`);
          continue;
        }
        const tv = tvRaw === null ? (isRatio ? null : 0) : Number(tvRaw);
        if (tv === null) {
          if (approxEq(ev, 0, 1e-6)) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${label}): excel=${ev} ts=null`);
          continue;
        }
        if (approxEq(ev, tv, 1e-4)) matched++;
        else if (fails.length < 30)
          fails.push(`${letter}${r}(${label}.${String(field)}): excel=${ev} ts=${tv}`);
      }
    }
    const rate = matched / total;
    console.log(
      `[매장 Stage1] 채널·전체 셀 매치 ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  실패표본:\n   ${fails.slice(0, 20).join("\n   ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.995);
  });

  // 대시보드 데이터·파생·(−)재고열 → StoreDashRow 필드.
  const DASH_COLS: Array<[string, string]> = [
    ["D", "saleMult"],
    ["E", "dotsDays"],
    ["F", "seasonPct"],
    ["G", "stockRatio"],
    ["L", "inQtyFix"],
    ["N", "saleQtyFix"],
    ["O", "summerInvQty"],
    ["P", "invQtyFix"],
    ["Q", "inQtyAll"],
    ["S", "saleQtyAll"],
    ["T", "invQtyAll"],
    ["V", "negQty"],
    ["W", "negAmt"],
  ];

  it("Stage2: 대시보드 집계행 R4~7 + 직영카드 R8~21 셀단위 매치율 ≥ 99%", () => {
    // 엔진 dashboard rows 를 키(코드/채널)로 인덱싱 → 엑셀 대시보드 행과 대조.
    // 엑셀 행 매핑: R4=전체, R5=직영, R6=중간관리, R7=기타, R8~21=직영점 14개(코드 A열).
    const dashByCode = new Map<string, NonNullable<typeof dashboard>["flatRows"][number]>();
    for (const row of dashboard!.flatRows) dashByCode.set(row.code, row);

    const EXCEL_ROWS: number[] = [];
    for (let r = 4; r <= 21; r++) EXCEL_ROWS.push(r);

    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (const r of EXCEL_ROWS) {
      const code = cellStr(dbWs, `A${r}`);
      if (!code) continue;
      const row = dashByCode.get(code);
      if (!row) {
        fails.push(`대시 행 ${r}(코드 ${code}) 엔진 미존재`);
        continue;
      }
      for (const [letter, field] of DASH_COLS) {
        const ev = cellNum(dbWs, `${letter}${r}`);
        const tvRaw = (row as unknown as Record<string, number | null>)[field];
        const isRatio = ["D", "E", "F", "G"].includes(letter);
        total++;
        if (ev === null) {
          if (tvRaw === null || tvRaw === 0) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${code}.${field}): excel=공란 ts=${tvRaw}`);
          continue;
        }
        const tv = tvRaw === null || tvRaw === undefined ? (isRatio ? null : 0) : Number(tvRaw);
        if (tv === null) {
          if (approxEq(ev, 0, 1e-6)) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${code}.${field}): excel=${ev} ts=null`);
          continue;
        }
        if (approxEq(ev, tv, 1e-4)) matched++;
        else if (fails.length < 30)
          fails.push(`${letter}${r}(${code}.${field}): excel=${ev} ts=${tv}`);
      }
    }
    const rate = matched / total;
    console.log(
      `[매장 Stage2] 대시보드 셀 매치 ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  실패표본:\n   ${fails.slice(0, 20).join("\n   ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.99);
  });

  // ── spec 매장 §7 고정 체크포인트 6개 ──

  it("체크포인트 ①: 칸반 무결성 H8(전체입고량)=H9+H10+H11 · AA8(전체판매량) 정합", () => {
    const h8 = cellNum(kbWs, "H8")!;
    const h9 = cellNum(kbWs, "H9") ?? 0;
    const h10 = cellNum(kbWs, "H10") ?? 0;
    const h11 = cellNum(kbWs, "H11") ?? 0;
    expect(approxEq(h8, h9 + h10 + h11, 1e-6)).toBe(true);
    // 엔진 전체 노드 = 엑셀 H8(전체 입고량 픽스).
    expect(approxEq(h8, dashboard!.root.kanban.inQtyFix, 1e-4)).toBe(true);
    expect(approxEq(cellNum(kbWs, "AA8")!, dashboard!.root.kanban.saleQtyAll, 1e-4)).toBe(true);
  });

  it("체크포인트 ②: 롤업 정합 — 채널 H9(직영)·H10(중관)·H11(기타) = SUMIF", () => {
    for (const [r, ch] of [
      [9, "직영"],
      [10, "중간관리"],
      [11, "기타"],
    ] as const) {
      const node = dashboard!.root.children.find((c) => c.label === ch)!;
      const ev = cellNum(kbWs, `H${r}`) ?? 0;
      expect(approxEq(ev, node.kanban.inQtyFix, 1e-4), `H${r} ${ch}`).toBe(true);
    }
  });

  it("체크포인트 ③: VLOOKUP 정확도 — 첫 점포 H13·AA13 RAW 재현", () => {
    const byCode = new Map<string, StoreKanbanRow>();
    for (const k of kanban) byCode.set(k.storeCode, k);
    const r = 13;
    const code = cellStr(kbWs, `A${r}`);
    const k = byCode.get(code)!;
    expect(approxEq(cellNum(kbWs, `H${r}`)!, k.inQtyFix!, 1e-4)).toBe(true);
    expect(approxEq(cellNum(kbWs, `AA${r}`)!, k.saleQtyAll!, 1e-4)).toBe(true);
  });

  it("체크포인트 ④: 파생 분기 — 대시 D4(판매배수)·E4·G4(재고보유율 T/I)", () => {
    const total = dashboard!.flatRows.find((x) => x.code === "전체")!;
    expect(approxEq(cellNum(dbWs, "D4")!, total.saleMult!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "E4")!, total.dotsDays!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "G4")!, total.stockRatio!, 1e-6)).toBe(true);
  });

  it("체크포인트 ⑤: 대시 행별 분기 — F4(=O4/T4) vs F8(=O8/P8) 다른 분모", () => {
    const total = dashboard!.flatRows.find((x) => x.code === "전체")!;
    const store = dashboard!.flatRows.find((x) => x.code === "8227")!;
    expect(approxEq(cellNum(dbWs, "F4")!, total.seasonPct!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "F8")!, store.seasonPct!, 1e-6)).toBe(true);
    // 집계는 T 분모(전체재고량), 점포는 P 분모(픽스재고량) — 값이 실제 달라야.
    expect(total.seasonPct).not.toBeNull();
    expect(store.seasonPct).not.toBeNull();
  });

  it("체크포인트 ⑥: (−)재고 키 이원화 — V4(코드키) vs V8(지점명키) 둘 다 일치", () => {
    const total = dashboard!.flatRows.find((x) => x.code === "전체")!;
    const store = dashboard!.flatRows.find((x) => x.code === "8227")!;
    expect(approxEq(cellNum(dbWs, "V4")!, total.negQty!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "W4")!, total.negAmt!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "V8")!, store.negQty!, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "W8")!, store.negAmt!, 1e-6)).toBe(true);
    // 직영 채널 V5 = SUM(점포), 중관 V6 = V4-V5 역산.
    const direct = dashboard!.flatRows.find((x) => x.code === "직영")!;
    expect(approxEq(cellNum(dbWs, "V5")!, direct.negQty!, 1e-4)).toBe(true);
  });
});
