/**
 * 누적 파일 교차검증 (동형 확인) — spec §0·부록C.
 *
 * 당월/누적은 수식·셀좌표 동형, 시트참조명과 앵커(D1/E1/F1)만 상이.
 *  - 당월 앵커: salesDays=21·monthDays=30·factor=1.22 (J=(N/D1)*E1*F1)
 *  - 누적 앵커: salesDays=172·monthDays=181·factor=1.02 (J=(N/E1)*F1*G1) ← 셀위치도 시프트
 *  - 누적 AM274~280 = AL/U(정상) — R7 버그는 당월 한정.
 *
 * ⚠️ 실데이터 파일 부재 시 skip(CI 안전). 값 커밋 금지(테스트가 xlsx 직접 대조).
 */

import { existsSync, readFileSync } from "node:fs";

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { ingestFiles } from "@/lib/ingest/ingest-files";

import { buildKanban } from "./stage1-kanban";
import { rollup, seasonGroup } from "./stage2-aggregate";
import { type FactKey, type FactLevel, type KanbanRow, type PeriodAnchors } from "./types";

const CUM_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx";
const HAS_FILE = existsSync(CUM_FILE);

/** 누적 앵커(실측: E1=172·F1=181·G1=1.02). */
const CUM_ANCHORS: PeriodAnchors = {
  salesDays: 172,
  monthDays: 181,
  factor: 1.02,
};

function approxEq(excel: number, ts: number, tol = 1e-4): boolean {
  return Math.abs(excel - ts) <= tol * (1 + Math.abs(excel));
}
function cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref];
  if (!c) return 0;
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

describe.skipIf(!HAS_FILE)("누적 파일 교차검증 (동형)", () => {
  const buf = HAS_FILE ? readFileSync(CUM_FILE) : Buffer.alloc(0);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = HAS_FILE
    ? ingestFiles([{ name: "누적.xlsx", size: buf.byteLength, bytes }])
    : null;
  const kanban: KanbanRow[] = HAS_FILE
    ? buildKanban({ records: ingest!.records, anchors: CUM_ANCHORS })
    : [];

  const wb = HAS_FILE
    ? XLSX.read(bytes, { type: "array", cellFormula: false })
    : ({ SheetNames: [], Sheets: {} } as XLSX.WorkBook);
  const kbWs = wb.Sheets[wb.SheetNames.find((n) => n.includes("물류전체칸반"))!];
  const dbWs = wb.Sheets[wb.SheetNames.find((n) => n.includes("대시보드"))!];

  it("Stage1 칸반 22열 셀단위 매치율 ≥ 99.9% (누적 앵커)", () => {
    const bySku = new Map(kanban.map((k) => [k.skuKey, k]));
    const COLS: Array<[string, keyof KanbanRow]> = [
      ["M", "m_qty"],
      ["N", "n_sales"],
      ["O", "o_cogs"],
      ["J", "j_estSales"],
      ["P", "p_dailyOut"],
      ["Y", "y_ctrQty"],
      ["Z", "z_ctrAmt"],
      ["AE", "ae_stoQty"],
      ["AF", "af_stoAmt"],
      ["AL", "al_openCtr"],
      ["AM", "am_openSto"],
      ["AC", "ac_ctrDeadAmt"],
      ["AI", "ai_stoDeadAmt"],
      ["AT", "at_inQty"],
      ["AZ", "az_outQty"],
      ["BD", "bd_retQty"],
      ["K", "k_logiCost"],
      ["BG", "bg_space"],
      ["BN", "bn_labor"],
      ["BT", "bt_freight"],
      ["BV", "bv_pack"],
    ];
    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (let r = 18; r <= 9916; r++) {
      const a = kbWs[`A${r}`];
      if (!a || a.v === null || a.v === undefined) continue;
      const sku = String(a.v).normalize("NFKC").trim().replace(/\s+/g, "");
      if (!sku) continue;
      const k = bySku.get(sku);
      if (!k) continue;
      for (const [letter, field] of COLS) {
        total++;
        const e = cellNum(kbWs, `${letter}${r}`) ?? 0;
        if (approxEq(e, Number(k[field]))) matched++;
        else if (fails.length < 15)
          fails.push(`${letter}${r}(${sku}): excel=${e} ts=${k[field]}`);
      }
    }
    const rate = matched / total;
     
    console.log(
      `[누적 Stage1] ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  ${fails.slice(0, 10).join("\n  ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.999);
  });

  it("Stage2: 누적 대시보드 핵심 셀 일치 (E4·F4·G4·E24·H4·R4)", () => {
    const classified = rollup(
      kanban,
      { gender: "", newcarry: "", season: "", item: "" },
      "L0_TOTAL",
      (k) => !!(k.gender && k.newcarry && k.season && k.item),
    );
    expect(approxEq(cellNum(dbWs, "E4")!, classified.sales)).toBe(true);
    expect(approxEq(cellNum(dbWs, "F4")!, classified.logiCost)).toBe(true);
    expect(approxEq(cellNum(dbWs, "G4")!, classified.logiRatio ?? 0, 1e-6)).toBe(true);
    expect(approxEq(cellNum(dbWs, "H4")!, classified.dotsTotal ?? 0)).toBe(true);
    expect(approxEq(cellNum(dbWs, "R4")!, classified.invAmtTotal)).toBe(true);

    // E24 리프(키 동적 추출 — 누적도 동형 레이아웃).
    const a = cellStr(dbWs, "A24");
    const b = cellStr(dbWs, "B24");
    const c = cellStr(dbWs, "C24");
    const d = cellStr(dbWs, "D24");
    if (a && d) {
      const fr = rollup(
        kanban,
        { gender: a, newcarry: b, season: c, item: d } as FactKey,
        "L5_ITEM" as FactLevel,
        (k) =>
          k.gender === a &&
          (b === "신상" || b === "이월" ? k.newcarry === b : true) &&
          k.season === c &&
          k.item === d,
      );
      expect(approxEq(cellNum(dbWs, "E24")!, fr.sales)).toBe(true);
    }
  });

  it("Stage2: 누적 대시보드 전 데이터·파생 셀 매치율 ≥ 99% (AM 정상=AL/U)", () => {
    const GENDER_LABELS = new Set(["여성", "남성", "아동"]);
    function sectionGenderFor(r: number): string {
      let section = "";
      for (let rr = 4; rr <= r; rr++) {
        const a = cellStr(dbWs, `A${rr}`);
        const b = cellStr(dbWs, `B${rr}`);
        const c = cellStr(dbWs, `C${rr}`);
        const d = cellStr(dbWs, `D${rr}`);
        if (!a && GENDER_LABELS.has(b) && !c && !d) section = b;
        if (a && GENDER_LABELS.has(a)) section = a;
      }
      return section;
    }
    function engineRowForDash(r: number, sectionGender: string) {
      const a = cellStr(dbWs, `A${r}`);
      const b = cellStr(dbWs, `B${r}`);
      const c = cellStr(dbWs, `C${r}`);
      const d = cellStr(dbWs, `D${r}`);
      const preds: Array<(k: KanbanRow) => boolean> = [];
      const key: FactKey = { gender: "", newcarry: "", season: "", item: "" };
      const gender = a || (GENDER_LABELS.has(b) ? b : sectionGender);
      if (gender) {
        key.gender = gender;
        preds.push((k) => k.gender === gender);
      }
      let nc = "";
      if (b === "신상" || b === "신상 전체") nc = "신상";
      else if (b === "이월" || b === "이월 전체") nc = "이월";
      if (nc) {
        key.newcarry = nc;
        preds.push((k) => k.newcarry === nc);
      }
      if (c === "SS시즌" || c === "FW시즌") {
        const g = c === "SS시즌" ? "SS" : "FW";
        preds.push((k) => seasonGroup(k.season) === g);
      } else if (c) {
        key.season = c;
        preds.push((k) => k.season === c);
      }
      if (d) {
        key.item = d;
        preds.push((k) => k.item === d);
      }
      return rollup(kanban, key, "L5_ITEM" as FactLevel, (k) => preds.every((p) => p(k)));
    }

    const DATA: Array<[string, keyof import("./types").FactRow]> = [
      ["E", "sales"], ["F", "logiCost"], ["O", "ctrQty"], ["P", "ctrAmt"],
      ["T", "stoQty"], ["U", "stoAmt"], ["W", "openAll"], ["AD", "dailyOut"],
      ["AJ", "ctrDeadAmt"], ["AL", "stoDeadAmt"],
    ];
    const DERIVED: Array<[string, keyof import("./types").FactRow]> = [
      ["G", "logiRatio"], ["R", "invAmtTotal"], ["AM", "deadStoPct"],
    ];
    let total = 0;
    let matched = 0;
    const fails: string[] = [];
    for (let r = 4; r <= 320; r++) {
      const a = cellStr(dbWs, `A${r}`);
      const b = cellStr(dbWs, `B${r}`);
      const c = cellStr(dbWs, `C${r}`);
      const d = cellStr(dbWs, `D${r}`);
      if (!a && !b && !c && !d) continue;
      const fr = engineRowForDash(r, sectionGenderFor(r));
      for (const [letter, field] of [...DATA, ...DERIVED]) {
        const ev = cellNum(dbWs, `${letter}${r}`);
        const tv = fr[field];
        total++;
        if (ev === null) {
          if (tv === null || tv === 0) matched++;
          else if (fails.length < 15) fails.push(`${letter}${r}: excel=공란 ts=${tv}`);
          continue;
        }
        if (tv === null) {
          if (approxEq(ev, 0, 1e-6)) matched++;
          else if (fails.length < 15) fails.push(`${letter}${r}: excel=${ev} ts=null`);
          continue;
        }
        if (approxEq(ev, Number(tv))) matched++;
        else if (fails.length < 15)
          fails.push(`${letter}${r}(${a}/${b}/${c}/${d}.${String(field)}): excel=${ev} ts=${tv}`);
      }
    }
    const rate = matched / total;
     
    console.log(
      `[누적 Stage2] ${matched}/${total} = ${(rate * 100).toFixed(4)}%` +
        (fails.length ? `\n  ${fails.slice(0, 10).join("\n  ")}` : ""),
    );
    expect(rate).toBeGreaterThanOrEqual(0.99);
  });

  it("누적 AM274 = AL/U(정상) — R7 버그 없음(당월 한정 확인)", () => {
    // 누적 동형이므로 AM274~280 전 행이 AL/U 캐시와 일치해야(R분모 변종 없음).
    let ok = 0;
    let checked = 0;
    for (let r = 274; r <= 280; r++) {
      const d = cellStr(dbWs, `D${r}`);
      if (!d) continue;
      checked++;
      const al = cellNum(dbWs, `AL${r}`) ?? 0;
      const u = cellNum(dbWs, `U${r}`) ?? 0;
      const excelAM = cellNum(dbWs, `AM${r}`);
      const correct = u === 0 ? null : al / u;
      if (correct === null ? excelAM === null : approxEq(excelAM ?? NaN, correct, 1e-6)) ok++;
    }
     
    console.log(`[누적 R7] AM274~280 = AL/U 일치 ${ok}/${checked} (버그 없음 기대)`);
    expect(ok).toBe(checked);
  });
});
