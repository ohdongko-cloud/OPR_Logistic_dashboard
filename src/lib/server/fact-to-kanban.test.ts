/**
 * fact-to-kanban 라운드트립 — 응답 계약 보존 증거.
 *
 * 핵심: DB FactKanban(SKU grain)을 KanbanRow 로 역매핑했을 때,
 *  buildDrilldownTree·skuDetailsFor 결과가 원본 kanban 과 "동일"해야 한다.
 *  (DB 경로와 라이브파일 경로가 같은 응답을 내야 UI 의존 안전.)
 *
 * ⚠️ 실데이터 파일 있으면 그걸로, 없으면 합성 칸반으로 검증(CI 안전).
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildDrilldownTree,
  flattenTree,
  skuDetailsFor,
  type KanbanRow,
} from "@/lib/engine";
import { ingestFiles } from "@/lib/ingest";
import { buildKanban, MONTH_ANCHORS } from "@/lib/engine";

import { factRowsToKanban, kanbanToFactRows } from "./fact-to-kanban";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);

/** 합성 칸반 1행(역매핑이 읽는 필드만 의미값, 나머지는 0). */
function synthKanban(): KanbanRow[] {
  const base = (
    gender: string,
    newcarry: string,
    season: string,
    item: string,
    sku: string,
    seed: number,
  ): KanbanRow => ({
    skuKey: sku,
    gender,
    newcarry,
    season,
    item,
    m_qty: seed,
    n_sales: seed * 100,
    o_cogs: seed * 80,
    j_estSales: seed * 120,
    p_dailyOut: seed * 3,
    y_ctrQty: seed * 2,
    z_ctrAmt: seed * 200,
    ab_ctrDeadQty: seed,
    ac_ctrDeadAmt: seed * 50,
    ae_stoQty: seed * 4,
    af_stoAmt: seed * 400,
    ah_stoDeadQty: seed,
    ai_stoDeadAmt: seed * 60,
    al_openCtr: seed * 150,
    am_openSto: seed * 350,
    ak_openAll: seed * 500,
    at_inQty: seed * 5,
    au_inAmt: seed * 500,
    az_outQty: seed * 6,
    ba_outAmt: seed * 600,
    bd_retQty: seed * 1,
    be_retAmt: seed * 70,
    aw_flowQty: seed * 12,
    aa_ctrAmtPct: 0,
    ay_flowPct: 0,
    bi_rent: 0,
    bk_receive: 0,
    bg_space: seed * 30,
    bp_outsource: 0,
    br_staff: 0,
    bn_labor: seed * 40,
    bt_freight: seed * 20,
    bx_box: 0,
    bz_material: 0,
    bv_pack: seed * 10,
    k_logiCost: seed * 100,
  });
  return [
    base("여성", "신상", "봄", "상의류", "2026SP-A1", 3),
    base("여성", "신상", "봄", "하의류", "2026SP-B2", 5),
    base("여성", "이월", "가을", "잡화류", "2025FW-C3", 2),
    base("남성", "신상", "여름", "상의류", "2026SU-D4", 7),
    base("아동", "이월", "공통", "아동복", "2025AL-E5", 4),
  ];
}

function getKanban(): KanbanRow[] {
  if (!HAS_FILE) return synthKanban();
  const buf = readFileSync(REAL_FILE);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = ingestFiles([{ name: "당월.xlsx", size: buf.byteLength, bytes }]);
  return buildKanban({ records: ingest.records, anchors: MONTH_ANCHORS });
}

describe("fact-to-kanban 라운드트립 (DB 경로 = 라이브파일 경로)", () => {
  const kanban = getKanban();
  const snapshotId = "snap-test";

  it("kanbanToFactRows → factRowsToKanban 로 트리 동형(노드 수·핵심지표 일치)", () => {
    const facts = kanbanToFactRows(kanban, snapshotId);
    const restored = factRowsToKanban(facts);

    const treeOrig = buildDrilldownTree(kanban, {});
    const treeRest = buildDrilldownTree(restored, {});

    const flatOrig = flattenTree(treeOrig);
    const flatRest = flattenTree(treeRest);
    expect(flatRest.length).toBe(flatOrig.length);

    // 노드별 핵심 지표 셀단위 일치(라운드트립 후에도 엑셀 동형 보장).
    const byIdOrig = new Map(flatOrig.map((n) => [n.node.id, n.node.metrics]));
    let checked = 0;
    for (const { node } of flatRest) {
      const o = byIdOrig.get(node.id);
      expect(o, `node ${node.id} missing in original`).toBeTruthy();
      if (!o) continue;
      const m = node.metrics;
      const tol = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a));
      expect(tol(m.sales, o.sales), `${node.id}.sales`).toBe(true);
      expect(tol(m.logiCost, o.logiCost), `${node.id}.logiCost`).toBe(true);
      expect(tol(m.ctrAmt, o.ctrAmt), `${node.id}.ctrAmt`).toBe(true);
      expect(tol(m.stoAmt, o.stoAmt), `${node.id}.stoAmt`).toBe(true);
      expect(tol(m.dailyOut, o.dailyOut), `${node.id}.dailyOut`).toBe(true);
      expect(tol(m.openAll, o.openAll), `${node.id}.openAll`).toBe(true);
      expect(tol(m.ctrDeadAmt, o.ctrDeadAmt), `${node.id}.ctrDeadAmt`).toBe(true);
      // 파생(비율·일수)도 동형
      const tolN = (a: number | null, b: number | null) =>
        a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a));
      expect(tolN(m.logiRatio, o.logiRatio), `${node.id}.logiRatio`).toBe(true);
      expect(tolN(m.dotsCtr, o.dotsCtr), `${node.id}.dotsCtr`).toBe(true);
      expect(tolN(m.deadCtrPct, o.deadCtrPct), `${node.id}.deadCtrPct`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("SKU 상세(skuDetailsFor)도 라운드트립 후 동일(매출액·추정·재고)", () => {
    const facts = kanbanToFactRows(kanban, snapshotId);
    const restored = factRowsToKanban(facts);

    // 분류된 첫 4키 노드를 골라 SKU 상세 비교.
    const leaf = kanban.find(
      (k) => k.gender && k.newcarry && k.season && k.item,
    );
    expect(leaf).toBeTruthy();
    if (!leaf) return;
    const key = {
      gender: leaf.gender,
      newcarry: leaf.newcarry,
      season: leaf.season,
      item: leaf.item,
    };
    const orig = skuDetailsFor(kanban, key);
    const rest = skuDetailsFor(restored, key);
    expect(rest.length).toBe(orig.length);
    // skuKey 정렬·매출액·추정매출·물류비·재고 일치
    const byKeyOrig = new Map(orig.map((s) => [s.skuKey, s]));
    for (const r of rest) {
      const o = byKeyOrig.get(r.skuKey);
      expect(o, `sku ${r.skuKey} missing`).toBeTruthy();
      if (!o) continue;
      const tol = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a));
      expect(tol(r.sales, o.sales), `${r.skuKey}.sales(N)`).toBe(true);
      expect(tol(r.estSales, o.estSales), `${r.skuKey}.estSales(J)`).toBe(true);
      expect(tol(r.logiCost, o.logiCost), `${r.skuKey}.logiCost`).toBe(true);
      expect(tol(r.ctrAmt, o.ctrAmt), `${r.skuKey}.ctrAmt`).toBe(true);
      expect(tol(r.inQty, o.inQty), `${r.skuKey}.inQty`).toBe(true);
      expect(tol(r.outQty, o.outQty), `${r.skuKey}.outQty`).toBe(true);
      expect(tol(r.retQty, o.retQty), `${r.skuKey}.retQty`).toBe(true);
    }
  });

  it("C10: 입출반 금액(au_inAmt/ba_outAmt/be_retAmt)이 DB 라운드트립 후 보존(이전엔 0으로 유실)", () => {
    const facts = kanbanToFactRows(kanban, snapshotId);
    // insert 입력에 금액 3필드가 박혀야 함(persist → DB 저장).
    expect(facts[0]).toHaveProperty("mInAmt");
    expect(facts[0]).toHaveProperty("mOutAmt");
    expect(facts[0]).toHaveProperty("mRetAmt");

    const restored = factRowsToKanban(facts);
    const byKey = new Map(restored.map((k) => [k.skuKey, k]));
    let checked = 0;
    for (const o of kanban) {
      const r = byKey.get(o.skuKey);
      if (!r) continue;
      const tol = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a));
      expect(tol(r.au_inAmt, o.au_inAmt), `${o.skuKey}.au_inAmt`).toBe(true);
      expect(tol(r.ba_outAmt, o.ba_outAmt), `${o.skuKey}.ba_outAmt`).toBe(true);
      expect(tol(r.be_retAmt, o.be_retAmt), `${o.skuKey}.be_retAmt`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
