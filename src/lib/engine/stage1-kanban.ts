/**
 * Stage1 — RAW rows → 칸반 22열 SKU 리프행 재구성.
 *
 * 근거: spec §2(RAW 핀고정)·§3(칸반 적재 산식)·§3-3(물류비 ABC 안분).
 *
 * 단계:
 *  1) SKU 유니버스 = 6 RAW 시트 조인키(A) 합집합(실측 3451행).
 *  2) 각 SKU: 측정값 = 시트별 SUMIF(조인키 A) 합산.
 *  3) 분류 = 시트 우선순위로 C/D/G/H 채택 → CB(gender)·CA(item) VLOOKUP.
 *  4) 칸반 파생열(J·P·AK·AW·S/T…) 행단위 연산.
 *  5) 물류비 안분 — ★순서의존: (a) 8행 전체 분모 산출(비중 분모),
 *     (b) 각 리프 비중 가중 배분(임차·수광=물류재고비중 / 도급·정직원=입출반비중 /
 *     운반=(출고+반품)비중 / 박스·부자재=입출반합계비중).
 */

import { isBlank, normalizeKey } from "@/lib/ingest/normalize";
import { type RawRowRecord, type CellValue } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { buildDimClassMaps, lookupGender, lookupItem } from "./dim-class";
import { extractLogiCostTotals } from "./logi-cost";
import { DIM_COLUMNS, DIM_PRIORITY } from "./raw-columns";
import {
  MONTH_ANCHORS,
  type KanbanRow,
  type PeriodAnchors,
} from "./types";

/** 엔진 입력 — ingest 의 records(시트별 RawRow[]) + 앵커. */
export interface EngineInput {
  records: Partial<Record<SheetType, RawRowRecord[]>>;
  anchors?: PeriodAnchors;
}

/** 시트별 SKU키 → 측정 컬럼 합산맵(SUMIF 1패스 흡수). */
type SumMap = Map<string, Record<string, number>>;

/** 한 시트의 (조인키 → 컬럼별 합계) 인덱스. SUMIF(A, key, col) 를 O(1) 조회로. */
function buildSumMap(rows: RawRowRecord[], cols: string[]): SumMap {
  const m: SumMap = new Map();
  for (const r of rows) {
    const key = r.skuKey; // 이미 normalizeKey 적용됨(buildRawRows)
    if (!key) continue;
    let acc = m.get(key);
    if (!acc) {
      acc = {};
      for (const c of cols) acc[c] = 0;
      m.set(key, acc);
    }
    for (const c of cols) {
      const v = numOf(r.data[c]);
      if (v !== null) acc[c] += v;
    }
  }
  return m;
}

function sumOf(map: SumMap, key: string, col: string): number {
  return map.get(key)?.[col] ?? 0;
}

/**
 * Stage1 메인 — RAW → KanbanRow[].
 */
export function buildKanban(input: EngineInput): KanbanRow[] {
  const recs = input.records;
  const anchors = input.anchors ?? MONTH_ANCHORS;
  const { salesDays, monthDays, factor } = anchors;

  // ── 분류 마스터 맵 ──
  const dim = buildDimClassMaps(recs["분류"] ?? []);

  // ── 물류비 총액 7종(8행 전체 소스) ──
  const logi = extractLogiCostTotals(recs["물류비예측"] ?? []);

  // ── 시트별 측정 SUMIF 인덱스 ──
  const salesMap = buildSumMap(recs["매출상세"] ?? [], ["H", "I", "J"]);
  const ctrInvMap = buildSumMap(recs["물류재고"] ?? [], ["H", "I", "X", "Y"]);
  const stoInvMap = buildSumMap(recs["점재고"] ?? [], ["H", "I", "X", "Y"]);
  const openCtrMap = buildSumMap(recs["기초재고_센터"] ?? [], ["I"]);
  const openStoMap = buildSumMap(recs["기초재고_지점"] ?? [], ["I"]);
  const ctrFlowMap = buildSumMap(
    recs["센터입출고"] ?? [],
    ["H", "I", "J", "K", "L", "M"],
  );

  // ── SKU 유니버스 + 분류 채택(시트 우선순위) ──
  const skuDims = collectSkuDims(recs);
  const skuKeys = [...skuDims.keys()];

  // ── 1패스: 측정값 + 분류 + 칸반 파생(물류비 제외) ──
  const rows: KanbanRow[] = skuKeys.map((sku) => {
    const d = skuDims.get(sku)!;
    const gender = lookupGender(dim, d.daegubun) ?? "";
    const item = lookupItem(dim, d.daebunlyu) ?? "";

    // 매출
    const m_qty = sumOf(salesMap, sku, "J");
    const n_sales = sumOf(salesMap, sku, "H");
    const o_cogs = sumOf(salesMap, sku, "I");
    const j_estSales = salesDays !== 0 ? (n_sales / salesDays) * monthDays * factor : 0;
    const p_dailyOut = salesDays !== 0 ? o_cogs / salesDays : 0;

    // 재고 물류(센터)
    const y_ctrQty = sumOf(ctrInvMap, sku, "H");
    const z_ctrAmt = sumOf(ctrInvMap, sku, "I");
    const ab_ctrDeadQty = sumOf(ctrInvMap, sku, "X");
    const ac_ctrDeadAmt = sumOf(ctrInvMap, sku, "Y");

    // 재고 지점(점포)
    const ae_stoQty = sumOf(stoInvMap, sku, "H");
    const af_stoAmt = sumOf(stoInvMap, sku, "I");
    const ah_stoDeadQty = sumOf(stoInvMap, sku, "X");
    const ai_stoDeadAmt = sumOf(stoInvMap, sku, "Y");

    // 기초재고
    const al_openCtr = sumOf(openCtrMap, sku, "I");
    const am_openSto = sumOf(openStoMap, sku, "I");
    const ak_openAll = al_openCtr + am_openSto;

    // 센터 입출고/반품 (H=금액·I=수량 역전 주의)
    const au_inAmt = sumOf(ctrFlowMap, sku, "H");
    const at_inQty = sumOf(ctrFlowMap, sku, "I");
    const be_retAmt = sumOf(ctrFlowMap, sku, "J");
    const bd_retQty = sumOf(ctrFlowMap, sku, "K");
    const ba_outAmt = sumOf(ctrFlowMap, sku, "L");
    const az_outQty = sumOf(ctrFlowMap, sku, "M");
    // AW 입출반 합계 수량 = AZ+BD+AT (출고+반품+입고)
    const aw_flowQty = az_outQty + bd_retQty + at_inQty;

    return {
      skuKey: sku,
      gender,
      newcarry: d.newcarry,
      season: d.season,
      item,
      m_qty,
      n_sales,
      o_cogs,
      j_estSales,
      p_dailyOut,
      y_ctrQty,
      z_ctrAmt,
      ab_ctrDeadQty,
      ac_ctrDeadAmt,
      ae_stoQty,
      af_stoAmt,
      ah_stoDeadQty,
      ai_stoDeadAmt,
      al_openCtr,
      am_openSto,
      ak_openAll,
      at_inQty,
      au_inAmt,
      az_outQty,
      ba_outAmt,
      bd_retQty,
      be_retAmt,
      aw_flowQty,
      // 비중·물류비는 2패스에서 채움(임시 0)
      aa_ctrAmtPct: 0,
      ay_flowPct: 0,
      bi_rent: 0,
      bk_receive: 0,
      bg_space: 0,
      bp_outsource: 0,
      br_staff: 0,
      bn_labor: 0,
      bt_freight: 0,
      bx_box: 0,
      bz_material: 0,
      bv_pack: 0,
      k_logiCost: 0,
    };
  });

  // ── 2패스: 8행(전체) 분모 산출(★순서의존) ──
  // ★실측 정정(엑셀 칸반 수식 직접 확인):
  //   AA(leaf) = Y{r}/$Y$8 → 물류재고비중 분모 = Σ y_ctrQty(재고수량 물류, Y8) — Z(재고액) 아님!
  //   AY(leaf) = AW{r}/$AW$8 → 입출반비중 분모 = Σ aw_flowQty(AW8)
  //   운반     = (AZ+BD)/($AZ$8+$BD$8) → 분모 = Σ(az_outQty+bd_retQty)
  //   인건비(도급/정직원) = AY 가중(BP8*AY·BR8*AY)
  //   박스·부자재 = AW/$AW$8 가중(=AY)
  let sumCtrQty = 0;
  let sumFlowQty = 0;
  let sumOutRet = 0;
  for (const r of rows) {
    sumCtrQty += r.y_ctrQty;
    sumFlowQty += r.aw_flowQty;
    sumOutRet += r.az_outQty + r.bd_retQty;
  }

  // ── 3패스: 리프행 비중 가중 안분 ──
  for (const r of rows) {
    // AA 물류재고비중 = y_ctrQty / Σy_ctrQty (= Y/$Y$8)
    const aa = sumCtrQty !== 0 ? r.y_ctrQty / sumCtrQty : 0;
    // AY 입출반비중 = aw_flowQty / ΣawFlowQty
    const ay = sumFlowQty !== 0 ? r.aw_flowQty / sumFlowQty : 0;

    r.aa_ctrAmtPct = aa;
    r.ay_flowPct = ay;

    // 공간비: 임차료 BI = BI8*AA · 수광비 BK = BK8*AA
    r.bi_rent = logi.rent * aa;
    r.bk_receive = logi.receive * aa;
    r.bg_space = r.bi_rent + r.bk_receive;

    // 인건비: 도급 BP = BP8*AY · 정직원 BR = BR8*AY
    r.bp_outsource = logi.outsource * ay;
    r.br_staff = logi.staff * ay;
    r.bn_labor = r.bp_outsource + r.br_staff;

    // 운반비 BT = ((AZ+BD)/(ΣAZ+ΣBD)) * BT8
    const freightPct = sumOutRet !== 0 ? (r.az_outQty + r.bd_retQty) / sumOutRet : 0;
    r.bt_freight = freightPct * logi.freight;

    // 포장비: 박스 BX = (AW/ΣAW)*BX8 · 부자재 BZ = (AW/ΣAW)*BZ8
    r.bx_box = ay * logi.box;
    r.bz_material = ay * logi.material;
    r.bv_pack = r.bx_box + r.bz_material;

    // 물류비 K = BG + BN + BT + BV
    r.k_logiCost = r.bg_space + r.bn_labor + r.bt_freight + r.bv_pack;
  }

  return rows;
}

/** SKU별 분류(대구분·대분류·시즌·구분) — 시트 우선순위로 채택. */
interface SkuDim {
  daegubun: CellValue;
  daebunlyu: CellValue;
  season: string;
  newcarry: string;
}

function collectSkuDims(
  recs: Partial<Record<SheetType, RawRowRecord[]>>,
): Map<string, SkuDim> {
  const out = new Map<string, SkuDim>();
  for (const sheet of DIM_PRIORITY) {
    const cols = DIM_COLUMNS[sheet];
    const rows = recs[sheet];
    if (!cols || !rows) continue;
    for (const r of rows) {
      const sku = r.skuKey;
      if (!sku || out.has(sku)) continue;
      out.set(sku, {
        daegubun: r.data[cols.daegubun] ?? null,
        daebunlyu: r.data[cols.daebunlyu] ?? null,
        season: strDim(r.data[cols.season]),
        newcarry: strDim(r.data[cols.newcarry]),
      });
    }
  }
  return out;
}

function strDim(v: CellValue): string {
  if (isBlank(v)) return "";
  return String(v).normalize("NFKC").trim();
}

function numOf(v: CellValue): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export { normalizeKey };
