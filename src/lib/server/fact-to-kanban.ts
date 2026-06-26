/**
 * 칸반 ↔ FactKanban 양방향 매핑 (영속화 + 복원).
 *
 * 설계: 아키텍처 §3-2 "4키 사전집계"는 SUM 롤업이 ETL에 흡수 가능하나,
 *  MVP 는 **SKU grain** 으로 FactKanban 을 박제한다 — 이유:
 *   ① 드릴다운 트리/롤업은 검증된 stage2 `rollup` 이 칸반행 부분집합을 SUM 재계산.
 *      4키 사전집계 행만 저장하면 임의 필터·SS/FW·시즌소계 재계산이 불가.
 *   ② SKU 상세(GET /api/agg/sku)는 SKU grain 이 필수.
 *  → SKU grain 저장 + 복원 시 동일 `buildDrilldownTree`/`skuDetailsFor` 입력 → **응답 계약 100% 보존**.
 *
 * FactKanban 의 19(+1 mSalesNet) 컬럼은 `kanbanToBase`(stage2)·`skuDetailsFor`(agg-tree)가
 *  읽는 칸반 필드를 모두 커버한다(아래 매핑표). 그 외 칸반 필드(m_qty·o_cogs·안분비중 등)는
 *  집계·표시에 쓰이지 않으므로 저장하지 않는다(YAGNI). 복원 시 0 으로 채운다.
 *
 *  매핑 (FactKanban 컬럼 → KanbanRow 필드):
 *    mSales    ← j_estSales   (E 실매출 추정 / 트리 sales)
 *    mSalesNet ← n_sales      (SKU 상세 매출액 원본)
 *    mLogiCost ← k_logiCost   (F 물류비)
 *    mRent     ← bg_space     (K 임차료=공간비)
 *    mLabor    ← bn_labor     (L 인건비)
 *    mFreight  ← bt_freight   (M 운반비)
 *    mPack     ← bv_pack      (N 포장비)
 *    mCtrQty   ← y_ctrQty     (O 센터재고량)
 *    mCtrAmt   ← z_ctrAmt     (P 센터재고액)
 *    mStoQty   ← ae_stoQty    (T 점포재고량)
 *    mStoAmt   ← af_stoAmt    (U 점포재고액)
 *    mOpenAll  ← ak_openAll   (W 기초전체)
 *    mOpenCtr  ← al_openCtr   (X 기초물류)
 *    mOpenSto  ← am_openSto   (Y 기초지점)
 *    mDailyOut ← p_dailyOut   (AD 일평균소진)
 *    mInQty    ← at_inQty     (AF 입고)
 *    mOutQty   ← az_outQty    (AG 출고)
 *    mRetQty   ← bd_retQty    (AH 반품)
 *    mDeadCtr  ← ac_ctrDeadAmt(AJ 센터체화액)
 *    mDeadSto  ← ai_stoDeadAmt(AL 지점체화액)
 */

import { type KanbanRow } from "@/lib/engine";

/** FactKanban insert 입력(Prisma createMany data) — Decimal 은 number 로 넣어도 변환됨. */
export interface FactKanbanInsert {
  snapshotId: string;
  gender: string;
  newcarry: string;
  season: string;
  item: string;
  skuKey: string | null;
  mSales: number;
  mSalesNet: number;
  mLogiCost: number;
  mRent: number;
  mLabor: number;
  mFreight: number;
  mPack: number;
  mCtrQty: number;
  mCtrAmt: number;
  mStoQty: number;
  mStoAmt: number;
  mOpenAll: number;
  mOpenCtr: number;
  mOpenSto: number;
  mDailyOut: number;
  mInQty: number;
  mOutQty: number;
  mRetQty: number;
  mDeadCtr: number;
  mDeadSto: number;
}

/** DB 에서 읽은 FactKanban 1행(Decimal 은 string|number|Decimal 가능 → toNum). */
export interface FactKanbanRow {
  gender: string;
  newcarry: string;
  season: string;
  item: string;
  skuKey: string | null;
  mSales: unknown;
  mSalesNet: unknown;
  mLogiCost: unknown;
  mRent: unknown;
  mLabor: unknown;
  mFreight: unknown;
  mPack: unknown;
  mCtrQty: unknown;
  mCtrAmt: unknown;
  mStoQty: unknown;
  mStoAmt: unknown;
  mOpenAll: unknown;
  mOpenCtr: unknown;
  mOpenSto: unknown;
  mDailyOut: unknown;
  mInQty: unknown;
  mOutQty: unknown;
  mRetQty: unknown;
  mDeadCtr: unknown;
  mDeadSto: unknown;
}

/** Prisma Decimal | string | number → number(소수 손실 없음, Decimal.toString 경유). */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // Prisma.Decimal 은 toString/toNumber 가짐 — 문자열 경유가 안전.
  const n = Number(typeof v === "object" && "toString" in v ? String(v) : v);
  return Number.isFinite(n) ? n : 0;
}

/** 칸반 SKU 행들 → FactKanban insert 입력(SKU grain, 미분류 포함). */
export function kanbanToFactRows(
  kanban: KanbanRow[],
  snapshotId: string,
): FactKanbanInsert[] {
  return kanban.map((k) => ({
    snapshotId,
    gender: k.gender,
    newcarry: k.newcarry,
    season: k.season,
    item: k.item,
    skuKey: k.skuKey || null,
    mSales: k.j_estSales,
    mSalesNet: k.n_sales,
    mLogiCost: k.k_logiCost,
    mRent: k.bg_space,
    mLabor: k.bn_labor,
    mFreight: k.bt_freight,
    mPack: k.bv_pack,
    mCtrQty: k.y_ctrQty,
    mCtrAmt: k.z_ctrAmt,
    mStoQty: k.ae_stoQty,
    mStoAmt: k.af_stoAmt,
    mOpenAll: k.ak_openAll,
    mOpenCtr: k.al_openCtr,
    mOpenSto: k.am_openSto,
    mDailyOut: k.p_dailyOut,
    mInQty: k.at_inQty,
    mOutQty: k.az_outQty,
    mRetQty: k.bd_retQty,
    mDeadCtr: k.ac_ctrDeadAmt,
    mDeadSto: k.ai_stoDeadAmt,
  }));
}

/**
 * DB FactKanban 행들 → KanbanRow[] 복원.
 *
 * 집계·SKU상세에 쓰이는 필드만 정확히 복원하고, 나머지는 0(미사용).
 * 이 복원물을 `buildDrilldownTree`/`skuDetailsFor` 에 넣으면 라이브파일 경로와 동일 출력.
 */
export function factRowsToKanban(rows: FactKanbanRow[]): KanbanRow[] {
  return rows.map((r) => ({
    skuKey: r.skuKey ?? "",
    gender: r.gender,
    newcarry: r.newcarry,
    season: r.season,
    item: r.item,

    // 집계·표시에 쓰이는 필드(역매핑)
    j_estSales: toNum(r.mSales),
    n_sales: toNum(r.mSalesNet),
    k_logiCost: toNum(r.mLogiCost),
    bg_space: toNum(r.mRent),
    bn_labor: toNum(r.mLabor),
    bt_freight: toNum(r.mFreight),
    bv_pack: toNum(r.mPack),
    y_ctrQty: toNum(r.mCtrQty),
    z_ctrAmt: toNum(r.mCtrAmt),
    ae_stoQty: toNum(r.mStoQty),
    af_stoAmt: toNum(r.mStoAmt),
    ak_openAll: toNum(r.mOpenAll),
    al_openCtr: toNum(r.mOpenCtr),
    am_openSto: toNum(r.mOpenSto),
    p_dailyOut: toNum(r.mDailyOut),
    at_inQty: toNum(r.mInQty),
    az_outQty: toNum(r.mOutQty),
    bd_retQty: toNum(r.mRetQty),
    ac_ctrDeadAmt: toNum(r.mDeadCtr),
    ai_stoDeadAmt: toNum(r.mDeadSto),

    // 집계·표시 미사용 필드(저장 안 함) — 0.
    m_qty: 0,
    o_cogs: 0,
    ab_ctrDeadQty: 0,
    ah_stoDeadQty: 0,
    au_inAmt: 0,
    ba_outAmt: 0,
    be_retAmt: 0,
    aw_flowQty: 0,
    aa_ctrAmtPct: 0,
    ay_flowPct: 0,
    bi_rent: 0,
    bk_receive: 0,
    bp_outsource: 0,
    br_staff: 0,
    bx_box: 0,
    bz_material: 0,
  }));
}
