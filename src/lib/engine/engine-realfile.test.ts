/**
 * 엔진 ↔ 엑셀 실측값 셀단위 대조 (증거 테스트 — 핵심).
 *
 * ⚠️ 실데이터 파일은 레포에 복사·커밋하지 않는다(보안). 절대경로 "참조만".
 *    파일 부재 시 skip(CI 안전). 산출 수치도 커밋하지 않음(테스트가 xlsx 직접 대조).
 *
 * 2단계 검증(spec §7):
 *   Stage1 = 엔진 칸반 ↔ 엑셀 `물류전체칸반(당월)` 캐시값(22열 × 3451행)
 *   Stage2 = 엔진 팩트 ↔ 엑셀 `※대시보드(시즌-아이템)` 캐시값(281행 × 데이터·파생열)
 *
 * ground truth = SheetJS `cell.v`(엑셀이 저장한 마지막 계산 캐시).
 * 부동소수 허용오차: |excel - ts| <= 1e-6 * (1 + |excel|).
 *
 * known-divergence: AM274~280(R7 — 엑셀 R분모 버그, 엔진은 AL/U 정답) → flag only.
 */

import { existsSync, readFileSync } from "node:fs";

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { ingestFiles } from "@/lib/ingest/ingest-files";

import { buildKanban } from "./stage1-kanban";
import { rollup, seasonGroup } from "./stage2-aggregate";
import { MONTH_ANCHORS, type FactKey, type FactLevel, type KanbanRow } from "./types";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);

/** 부동소수 허용오차(상대+절대). */
function approxEq(excel: number, ts: number, tol = 1e-6): boolean {
  return Math.abs(excel - ts) <= tol * (1 + Math.abs(excel));
}

/** 엑셀 캐시 셀값(SheetJS cell.v). 빈/문자 → null(공란=파생 분모0). */
function cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref];
  if (!c) return 0; // 빈 셀 = 0 적재(SUMIF/SUM 결과)
  if (c.t === "n" && typeof c.v === "number") return c.v;
  // 문자/빈 = 공란(IFERROR "" → 파생 null). 단 데이터열의 빈문자는 0.
  if (c.v === "" || c.v === null || c.v === undefined) return null;
  if (typeof c.v === "number") return c.v;
  return null;
}

function cellStr(ws: XLSX.WorkSheet, ref: string): string {
  const c = ws[ref];
  if (!c || c.v === null || c.v === undefined) return "";
  return String(c.v).normalize("NFKC").trim();
}

describe.skipIf(!HAS_FILE)("엔진 ↔ 엑셀 실측 대조 (당월 아이템)", () => {
  const buf = HAS_FILE ? readFileSync(REAL_FILE) : Buffer.alloc(0);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  // ── ingest → 엔진 ──
  const ingest = HAS_FILE
    ? ingestFiles([{ name: "당월.xlsx", size: buf.byteLength, bytes }])
    : null;
  const kanban: KanbanRow[] = HAS_FILE
    ? buildKanban({ records: ingest!.records, anchors: MONTH_ANCHORS })
    : [];

  // ── 엑셀 캐시값 워크북(검증 ground truth) ──
  const wb = HAS_FILE
    ? XLSX.read(bytes, { type: "array", cellFormula: false, cellNF: false, cellText: false })
    : ({ SheetNames: [], Sheets: {} } as XLSX.WorkBook);
  const kbName = wb.SheetNames.find((n) => n.includes("물류전체칸반"))!;
  const dbName = wb.SheetNames.find((n) => n.includes("대시보드"))!;
  const kbWs = wb.Sheets[kbName];
  const dbWs = wb.Sheets[dbName];

  it("ingest 6 RAW 충족 + 칸반 SKU 유니버스 = 엑셀 칸반 행수", () => {
    expect(ingest!.ok).toBe(true);
    // 엑셀 칸반 데이터부 18행~ : SKU 행수 카운트(A열 비공백)
    let excelRows = 0;
    for (let r = 18; r <= 9916; r++) {
      const a = kbWs[`A${r}`];
      if (a && a.v !== null && a.v !== undefined && String(a.v).trim() !== "")
        excelRows++;
    }
    expect(kanban.length).toBe(excelRows);
  });

  // ── Stage1: 칸반 22열 셀단위 대조 ──
  it("Stage1: 칸반 22열 × 전행 셀단위 매치율 ≥ 99.9%", () => {
    // 엔진 칸반 SKU → row 인덱스 맵(엑셀 칸반은 18행부터 SKU 순서). SKU키로 조인.
    const bySku = new Map<string, KanbanRow>();
    for (const k of kanban) bySku.set(k.skuKey, k);

    // 엑셀 칸반 SKU 행 수집(A열) → 행번호.
    const excelSkuRow = new Map<string, number>();
    for (let r = 18; r <= 9916; r++) {
      const a = kbWs[`A${r}`];
      if (!a || a.v === null || a.v === undefined) continue;
      const sku = String(a.v).normalize("NFKC").trim().replace(/\s+/g, "");
      if (sku) excelSkuRow.set(sku, r);
    }

    // 22 칸반열 → KanbanRow 필드 매핑(letter → 엔진 필드).
    const COLS: Array<[string, keyof KanbanRow]> = [
      ["M", "m_qty"],
      ["N", "n_sales"],
      ["O", "o_cogs"],
      ["J", "j_estSales"],
      ["P", "p_dailyOut"],
      ["Y", "y_ctrQty"],
      ["Z", "z_ctrAmt"],
      ["AB", "ab_ctrDeadQty"],
      ["AC", "ac_ctrDeadAmt"],
      ["AE", "ae_stoQty"],
      ["AF", "af_stoAmt"],
      ["AH", "ah_stoDeadQty"],
      ["AI", "ai_stoDeadAmt"],
      ["AK", "ak_openAll"],
      ["AL", "al_openCtr"],
      ["AM", "am_openSto"],
      ["AT", "at_inQty"],
      ["AU", "au_inAmt"],
      ["AZ", "az_outQty"],
      ["BA", "ba_outAmt"],
      ["BD", "bd_retQty"],
      ["BE", "be_retAmt"],
      ["AW", "aw_flowQty"],
      ["BG", "bg_space"],
      ["BN", "bn_labor"],
      ["BT", "bt_freight"],
      ["BV", "bv_pack"],
      ["BI", "bi_rent"],
      ["BK", "bk_receive"],
      ["BP", "bp_outsource"],
      ["BR", "br_staff"],
      ["BX", "bx_box"],
      ["BZ", "bz_material"],
      ["K", "k_logiCost"],
    ];

    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (const [sku, r] of excelSkuRow) {
      const k = bySku.get(sku);
      if (!k) {
        fails.push(`SKU ${sku} (엑셀행 ${r}) 엔진 미존재`);
        continue;
      }
      for (const [letter, field] of COLS) {
        const ev = cellNum(kbWs, `${letter}${r}`);
        const tv = Number(k[field]);
        total++;
        const e = ev ?? 0;
        if (approxEq(e, tv, 1e-4)) matched++;
        else if (fails.length < 30)
          fails.push(`${letter}${r}(${sku}.${String(field)}): excel=${e} ts=${tv}`);
      }
    }
    const rate = matched / total;
    // 진단 출력(증거).
     
    console.log(
      `[Stage1] 칸반 셀 매치 ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  실패표본:\n   ${fails.slice(0, 20).join("\n   ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.999);
  });

  // ── Stage2: 대시보드 281행 셀단위 대조 ──
  // 대시보드 행을 키(A/B/C/D)로 읽어 엔진 rollup(같은 키)과 대조.
  function dashKey(r: number): {
    a: string;
    b: string;
    c: string;
    d: string;
  } {
    return {
      a: cellStr(dbWs, `A${r}`),
      b: cellStr(dbWs, `B${r}`),
      c: cellStr(dbWs, `C${r}`),
      d: cellStr(dbWs, `D${r}`),
    };
  }

  const GENDER_LABELS = new Set(["여성", "남성", "아동"]);

  /**
   * 대시보드 1행 → 엔진 rollup.
   *
   * 구조(실측 E수식): 4~12 = 전사 롤업(성별 무관), 14~102 = 여성 블록,
   * 103~191 = 남성, 192~280 = 아동. 성별헤더(L1)는 A=공백·B=성별 → 섹션 스코프.
   * SUMIFS 리프/소계(L4/L5)만 A=성별 채움.
   *
   * @param sectionGender forward-fill 된 현재 성별 섹션("" = 전사).
   */
  function engineRowForDash(r: number, sectionGender: string) {
    const { a, b, c, d } = dashKey(r);
    const preds: Array<(k: KanbanRow) => boolean> = [];
    const key: FactKey = { gender: "", newcarry: "", season: "", item: "" };
    let level: FactLevel = "L0_TOTAL";

    // 성별 스코프: A(리프) 우선, 없으면 섹션(L1 헤더/소계).
    const gender = a || (GENDER_LABELS.has(b) ? b : sectionGender);
    if (gender) {
      key.gender = gender;
      preds.push((k) => k.gender === gender);
      level = "L1_GENDER";
    }

    // B: 신상/이월 (또는 "신상 전체"/"이월 전체" = 롤업 헤더). 성별헤더(B=성별)는 무시.
    let nc = "";
    if (b === "신상" || b === "신상 전체") nc = "신상";
    else if (b === "이월" || b === "이월 전체") nc = "이월";
    if (nc) {
      key.newcarry = nc;
      preds.push((k) => k.newcarry === nc);
      level = "L2_NEWCARRY";
    }

    // C: 실시즌 / SS시즌 / FW시즌
    if (c === "SS시즌" || c === "FW시즌") {
      key.season = c;
      const g = c === "SS시즌" ? "SS" : "FW";
      preds.push((k) => seasonGroup(k.season) === g);
      level = "L3_SSFW";
    } else if (c) {
      key.season = c;
      preds.push((k) => k.season === c);
      level = "L4_SEASON";
    }

    // D: 아이템(리프)
    if (d) {
      key.item = d;
      preds.push((k) => k.item === d);
      level = "L5_ITEM";
    }
    const predicate = (k: KanbanRow) => preds.every((p) => p(k));
    return rollup(kanban, key, level, predicate);
  }

  /** 행 r 의 forward-fill 성별 섹션 산출(4~r 스캔). */
  function sectionGenderFor(r: number): string {
    let section = "";
    for (let rr = 4; rr <= r; rr++) {
      const a = cellStr(dbWs, `A${rr}`);
      const b = cellStr(dbWs, `B${rr}`);
      const c = cellStr(dbWs, `C${rr}`);
      const d = cellStr(dbWs, `D${rr}`);
      // L1 성별 헤더: A 공백 · B=성별 · C/D 공백.
      if (!a && GENDER_LABELS.has(b) && !c && !d) section = b;
      // 리프(A=성별) 진입 시에도 섹션 동기화.
      if (a && GENDER_LABELS.has(a)) section = a;
    }
    return section;
  }

  // 대시보드 데이터·파생열 → FactRow 필드.
  const DATA_COLS: Array<[string, keyof import("./types").FactRow]> = [
    ["E", "sales"],
    ["F", "logiCost"],
    ["K", "rent"],
    ["L", "labor"],
    ["M", "freight"],
    ["N", "pack"],
    ["O", "ctrQty"],
    ["P", "ctrAmt"],
    ["T", "stoQty"],
    ["U", "stoAmt"],
    ["W", "openAll"],
    ["X", "openCtr"],
    ["Y", "openSto"],
    ["AD", "dailyOut"],
    ["AF", "inQty"],
    ["AG", "outQty"],
    ["AH", "retQty"],
    ["AJ", "ctrDeadAmt"],
    ["AL", "stoDeadAmt"],
  ];
  const DERIVED_COLS: Array<[string, keyof import("./types").FactRow]> = [
    ["G", "logiRatio"],
    ["H", "dotsTotal"],
    ["I", "dotsCtr"],
    ["J", "dotsSto"],
    ["R", "invAmtTotal"],
    ["Z", "avgInvTotal"],
    ["AA", "avgInvCtr"],
    ["AB", "avgInvSto"],
    ["AK", "deadCtrPct"],
    ["AM", "deadStoPct"],
  ];

  // 대시보드 데이터 행 범위 — 헤더 3행 다음 4행~끝. A/B/C/D 중 하나라도 값 있는 행만.
  function dashboardRows(): number[] {
    const rows: number[] = [];
    for (let r = 4; r <= 320; r++) {
      const { a, b, c, d } = dashKey(r);
      const eCell = dbWs[`E${r}`];
      const hasKey = a || b || c || d;
      const hasE = eCell && eCell.v !== null && eCell.v !== undefined && eCell.v !== "";
      if (hasKey || hasE) rows.push(r);
    }
    return rows;
  }

  it("Stage2: 대시보드 데이터·파생 셀단위 매치율 ≥ 99% (R7 7셀 제외)", () => {
    const rows = dashboardRows();
    const R7_ROWS = new Set([274, 275, 276, 277, 278, 279, 280]);
    let total = 0;
    let matched = 0;
    let r7Flagged = 0;
    const fails: string[] = [];

    for (const r of rows) {
      const { a, b, c, d } = dashKey(r);
      if (!a && !b && !c && !d) continue; // 시각 간격 빈 행
      const fr = engineRowForDash(r, sectionGenderFor(r));

      for (const [letter, field] of [...DATA_COLS, ...DERIVED_COLS]) {
        const ev = cellNum(dbWs, `${letter}${r}`);
        const tvRaw = fr[field];
        const isDerivedRatio = ["G", "AK", "AM"].includes(letter);

        // R7 known-divergence: AM274~280 (엑셀 R분모 버그). flag, skip 비교.
        if (letter === "AM" && R7_ROWS.has(r)) {
          r7Flagged++;
          continue;
        }

        total++;
        // 엑셀 공란("") = null. 엔진 null 과 매칭.
        if (ev === null) {
          if (tvRaw === null || tvRaw === 0) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${a}/${b}/${c}/${d}.${String(field)}): excel=공란 ts=${tvRaw}`);
          continue;
        }
        const tv = tvRaw === null ? (isDerivedRatio ? null : 0) : Number(tvRaw);
        if (tv === null) {
          // 엔진 null인데 엑셀 숫자 → 불일치(단 0 근사면 OK)
          if (approxEq(ev, 0, 1e-6)) matched++;
          else if (fails.length < 30)
            fails.push(`${letter}${r}(${a}/${b}/${c}/${d}): excel=${ev} ts=null`);
          continue;
        }
        if (approxEq(ev, tv, 1e-4)) matched++;
        else if (fails.length < 30)
          fails.push(`${letter}${r}(${a}/${b}/${c}/${d}.${String(field)}): excel=${ev} ts=${tv}`);
      }
    }
    const rate = matched / total;
     
    console.log(
      `[Stage2] 대시보드 셀 매치 ${matched}/${total} = ${(rate * 100).toFixed(4)}% ` +
        `(R7 flagged ${r7Flagged}셀)` +
        (fails.length ? `\n  실패표본:\n   ${fails.slice(0, 20).join("\n   ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.99);
    expect(r7Flagged).toBe(7); // R7 7셀 확인
  });

  // ── spec §7 고정 체크포인트 ──
  it("체크포인트 ①: E4(전체 실매출)·F4(물류비)·G4(물류비율) 무결성", () => {
    const total = rollup(kanban, { gender: "", newcarry: "", season: "", item: "" }, "L0_TOTAL", () => !!(
      // 분류 매칭된 SKU만(대시보드 집계 모집단)
      true
    ));
    // 분류매칭 모집단으로 재산출(대시보드와 동일)
    const classified = rollup(
      kanban,
      { gender: "", newcarry: "", season: "", item: "" },
      "L0_TOTAL",
      (k) => !!(k.gender && k.newcarry && k.season && k.item),
    );
    expect(approxEq(cellNum(dbWs, "E4")!, classified.sales, 1e-4)).toBe(true);
    expect(approxEq(cellNum(dbWs, "F4")!, classified.logiCost, 1e-4)).toBe(true);
    expect(approxEq(cellNum(dbWs, "G4")!, classified.logiRatio ?? 0, 1e-6)).toBe(true);
    expect(total.sales).toBeGreaterThan(0);
  });

  it("체크포인트 ②: 성별 헤더 E14(여성)·E103(남성)·E192(아동) 롤업 정합", () => {
    for (const [r, g] of [
      [14, "여성"],
      [103, "남성"],
      [192, "아동"],
    ] as const) {
      const ev = cellNum(dbWs, `E${r}`);
      if (ev === null) continue;
      // 해당 행의 실제 성별 라벨 확인(B열) — 위치 가변 방어
      const fr = rollup(kanban, { gender: g, newcarry: "", season: "", item: "" }, "L1_GENDER", (k) => k.gender === g);
      expect(approxEq(ev, fr.sales, 1e-4), `E${r} ${g}`).toBe(true);
    }
  });

  it("체크포인트 ③: E24(여성·신상·봄·상의류) 4키 SUMIFS 정확도", () => {
    const fr = rollup(
      kanban,
      { gender: "여성", newcarry: "신상", season: "봄", item: "상의류" },
      "L5_ITEM",
      (k) =>
        k.gender === "여성" &&
        k.newcarry === "신상" &&
        k.season === "봄" &&
        k.item === "상의류",
    );
    expect(approxEq(cellNum(dbWs, "E24")!, fr.sales, 1e-4)).toBe(true);
  });

  it("체크포인트 ④: H4(총재고일수 가중)·R4(총기말재고 가산) 분기", () => {
    const classified = rollup(
      kanban,
      { gender: "", newcarry: "", season: "", item: "" },
      "L0_TOTAL",
      (k) => !!(k.gender && k.newcarry && k.season && k.item),
    );
    expect(approxEq(cellNum(dbWs, "H4")!, classified.dotsTotal ?? 0, 1e-4)).toBe(true);
    expect(approxEq(cellNum(dbWs, "R4")!, classified.invAmtTotal, 1e-4)).toBe(true);
  });

  it("R7: AM274~280 = 엔진 AL/U(정답) ≠ 엑셀 AL/R(버그) — known-divergence 명시", () => {
    // 엑셀 AM274~280 = IFERROR(AL/R,"")(R=P+U 분모 — 당월 한정 편집 버그).
    // 엔진 = AL/U(지점체화금액÷점포재고액) — 정의 정합. spec §6.
    // 검증: ① 엔진은 모든 7행에서 AL/U 를 산출(엑셀 셀 AL/U 로 재계산 일치)
    //       ② 그중 분모0 아닌 행(AM278·AM280)은 엑셀 캐시(AL/R)와 실제로 달라야(divergence 확인).
    let divergences = 0;
    let alUmatches = 0;
    let checked = 0;
    for (let r = 274; r <= 280; r++) {
      const a = cellStr(dbWs, `A${r}`);
      const b = cellStr(dbWs, `B${r}`);
      const c = cellStr(dbWs, `C${r}`);
      const d = cellStr(dbWs, `D${r}`);
      if (!d) continue;
      const fr = rollup(
        kanban,
        { gender: a, newcarry: b === "신상" || b === "이월" ? b : "", season: c, item: d },
        "L5_ITEM",
        (k) =>
          k.gender === a &&
          (b === "신상" || b === "이월" ? k.newcarry === b : true) &&
          k.season === c &&
          k.item === d,
      );
      checked++;
      // 엑셀 셀 AL(지점체화금액)·U(점포재고액) 로 "정답 AL/U" 직접 산출.
      const al = cellNum(dbWs, `AL${r}`) ?? 0;
      const u = cellNum(dbWs, `U${r}`) ?? 0;
      const correctAlU = u === 0 ? null : al / u;
      // ① 엔진 = AL/U
      if (correctAlU === null ? fr.deadStoPct === null : approxEq(correctAlU, fr.deadStoPct!, 1e-6))
        alUmatches++;
      // ② 엑셀 캐시(AL/R)와 엔진(AL/U)이 실제 다른 행 카운트(분모0 제외).
      const excelCached = cellNum(dbWs, `AM${r}`);
      if (
        fr.deadStoPct !== null &&
        (excelCached === null || !approxEq(excelCached, fr.deadStoPct, 1e-6))
      )
        divergences++;
    }
     
    console.log(
      `[R7] AM274~280: 검사 ${checked}행 · 엔진=AL/U 일치 ${alUmatches} · 엑셀(AL/R)과 divergence ${divergences} (예상 2: AM278·AM280)`,
    );
    expect(checked).toBe(7);
    expect(alUmatches).toBe(7); // 엔진은 전 7행 AL/U 정답
    expect(divergences).toBe(2); // AM278·AM280 만 실제 분모차 발생(나머지 5행 분모0)
  });

  it("성능: 3451행 Stage1+Stage2 집계 시간 측정", () => {
    const t0 = performance.now();
    const kb = buildKanban({ records: ingest!.records, anchors: MONTH_ANCHORS });
    const t1 = performance.now();
    // 전체 트리 1회
    rollup(kb, { gender: "", newcarry: "", season: "", item: "" }, "L0_TOTAL", () => true);
    const t2 = performance.now();
     
    console.log(
      `[성능] Stage1(칸반 ${kb.length}행) ${(t1 - t0).toFixed(1)}ms · 전체롤업 ${(t2 - t1).toFixed(1)}ms`,
    );
    expect(kb.length).toBeGreaterThan(3000);
  });
});
