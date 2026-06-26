/**
 * 매장 칸반 ↔ FactStore 양방향 매핑 (영속화 + 복원).
 *
 * 설계: 점포 grain(31점) 박제. 칸반 데이터열 24개 + 기준마스터(H~K) + (−)재고(V/W) + 카드여부.
 *   파생열(D·E·F·G·O·V·AD·AI)은 저장 안 함 — 복원 시 deriveKanban 으로 재계산(엑셀 동형 보존).
 *   채널·지점명은 RAW 부재 마스터(칸반 B/C 원본) → 그대로 박제(복원 시 동일 트리·동일 검증).
 *
 * 복원 라운드트립: FactStore → StoreKanbanRow[] + curation + errors → buildStoreDashboard
 *   = 라이브파일 경로와 동일 출력(store-fact.test 검증).
 */

import {
  KANBAN_DATA_FIELDS,
  normalizeStoreName,
  type StoreChannel,
  type StoreCuration,
  type StoreErrorIndex,
  type StoreKanbanRow,
  type StoreMaster,
  type StoreParams,
} from "@/lib/engine-store";

/** 집계 마스터 라벨(전체/채널) — 점포코드와 구분되는 큐레이션 행. */
const AGG_LABELS = ["전체", "직영", "중간관리", "기타"];

/** 점포 1행의 (−)재고 + 카드 메타(persist 입력 보강). */
export interface StoreFactExtra {
  isCard: boolean;
  master: StoreMaster;
  negQty: number | null;
  negAmt: number | null;
}

/** FactStore insert 입력(Prisma createMany data). */
export interface FactStoreInsert {
  snapshotId: string;
  storeCode: string;
  channel: string;
  storeName: string;
  // 픽스 데이터열
  mInQtyFix: number;
  mInAmtFix: number;
  mRetQtyFix: number;
  mRetAmtFix: number;
  mSaleQtyFix: number;
  mSaleAmtFix: number;
  mCogsFix: number;
  mSummerInvQty: number;
  mSummerInvAmt: number;
  mInvQtyFix: number;
  mInvAmtFix: number;
  mOpenQtyFix: number;
  mOpenAmtFix: number;
  // 전체 데이터열
  mInQtyAll: number;
  mInAmtAll: number;
  mRetQtyAll: number;
  mRetAmtAll: number;
  mSaleQtyAll: number;
  mSaleAmtAll: number;
  mCogsAll: number;
  mInvQtyAll: number;
  mInvAmtAll: number;
  mOpenQtyAll: number;
  mOpenAmtAll: number;
  // 마스터 + (−)재고 + 카드
  areaPyeong: number | null;
  baseInvQty: number | null;
  baseDisplayQty: number | null;
  baseRunQty: number | null;
  isCard: boolean;
  mNegQty: number | null;
  mNegAmt: number | null;
}

/** Decimal|string|number → number. */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(typeof v === "object" && "toString" in v ? String(v) : v);
  return Number.isFinite(n) ? n : 0;
}
function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = toNum(v);
  return n;
}

/** 데이터열 0 인 빈 insert 행(집계 마스터 행용 — 데이터는 복원 시 점포 SUM 으로 재계산). */
function blankInsert(snapshotId: string, code: string, channel: string): FactStoreInsert {
  const z: Record<string, number> = {};
  for (const f of KANBAN_DATA_FIELDS) z["m" + f.charAt(0).toUpperCase() + f.slice(1)] = 0;
  return {
    snapshotId,
    storeCode: code,
    channel,
    storeName: "",
    mInQtyFix: 0, mInAmtFix: 0, mRetQtyFix: 0, mRetAmtFix: 0, mSaleQtyFix: 0, mSaleAmtFix: 0,
    mCogsFix: 0, mSummerInvQty: 0, mSummerInvAmt: 0, mInvQtyFix: 0, mInvAmtFix: 0,
    mOpenQtyFix: 0, mOpenAmtFix: 0, mInQtyAll: 0, mInAmtAll: 0, mRetQtyAll: 0, mRetAmtAll: 0,
    mSaleQtyAll: 0, mSaleAmtAll: 0, mCogsAll: 0, mInvQtyAll: 0, mInvAmtAll: 0,
    mOpenQtyAll: 0, mOpenAmtAll: 0,
    areaPyeong: null, baseInvQty: null, baseDisplayQty: null, baseRunQty: null,
    isCard: false, mNegQty: null, mNegAmt: null,
  };
}

/**
 * 매장 칸반행 + 큐레이션/수불오차 → FactStore insert 입력.
 * 점포 grain(31점) + 집계 마스터 행(전체/직영/중관/기타 — H~K 마스터·코드키 (−)재고).
 * 데이터열은 점포행만 채우고, 집계 행은 마스터·(−)재고만(데이터는 복원 시 점포 SUM 재계산).
 */
export function storeKanbanToFactRows(
  kanban: StoreKanbanRow[],
  snapshotId: string,
  curation: StoreCuration,
  errors: StoreErrorIndex,
): FactStoreInsert[] {
  const pointRows = kanban.map((k) => {
    const master = curation.masters[k.storeCode] ?? {
      areaPyeong: null,
      baseInvQty: null,
      baseDisplayQty: null,
      baseRunQty: null,
    };
    const neg = errors.byName.get(normalizeStoreName(k.storeName)) ?? {
      negQty: null,
      negAmt: null,
    };
    return {
      snapshotId,
      storeCode: k.storeCode,
      channel: k.channel,
      storeName: k.storeName,
      mInQtyFix: k.inQtyFix,
      mInAmtFix: k.inAmtFix,
      mRetQtyFix: k.retQtyFix,
      mRetAmtFix: k.retAmtFix,
      mSaleQtyFix: k.saleQtyFix,
      mSaleAmtFix: k.saleAmtFix,
      mCogsFix: k.cogsFix,
      mSummerInvQty: k.summerInvQty,
      mSummerInvAmt: k.summerInvAmt,
      mInvQtyFix: k.invQtyFix,
      mInvAmtFix: k.invAmtFix,
      mOpenQtyFix: k.openQtyFix,
      mOpenAmtFix: k.openAmtFix,
      mInQtyAll: k.inQtyAll,
      mInAmtAll: k.inAmtAll,
      mRetQtyAll: k.retQtyAll,
      mRetAmtAll: k.retAmtAll,
      mSaleQtyAll: k.saleQtyAll,
      mSaleAmtAll: k.saleAmtAll,
      mCogsAll: k.cogsAll,
      mInvQtyAll: k.invQtyAll,
      mInvAmtAll: k.invAmtAll,
      mOpenQtyAll: k.openQtyAll,
      mOpenAmtAll: k.openAmtAll,
      areaPyeong: master.areaPyeong,
      baseInvQty: master.baseInvQty,
      baseDisplayQty: master.baseDisplayQty,
      baseRunQty: master.baseRunQty,
      isCard: curation.codes.includes(k.storeCode),
      mNegQty: neg.negQty,
      mNegAmt: neg.negAmt,
    };
  });

  // 집계 마스터 행(전체/직영/중관/기타) — H~K 마스터 + 코드키 (−)재고. 데이터열 0(복원 시 재계산).
  const aggRows: FactStoreInsert[] = [];
  for (const label of AGG_LABELS) {
    const master = curation.masters[label];
    const neg = errors.byCode.get(label);
    if (!master && !neg) continue;
    const row = blankInsert(snapshotId, label, label === "전체" ? "전체" : label);
    if (master) {
      row.areaPyeong = master.areaPyeong;
      row.baseInvQty = master.baseInvQty;
      row.baseDisplayQty = master.baseDisplayQty;
      row.baseRunQty = master.baseRunQty;
    }
    if (neg) {
      row.mNegQty = neg.negQty;
      row.mNegAmt = neg.negAmt;
    }
    aggRows.push(row);
  }

  return [...pointRows, ...aggRows];
}

/** DB FactStore 1행(Decimal unknown). */
export interface FactStoreRow {
  storeCode: string;
  channel: string;
  storeName: string;
  mInQtyFix: unknown;
  mInAmtFix: unknown;
  mRetQtyFix: unknown;
  mRetAmtFix: unknown;
  mSaleQtyFix: unknown;
  mSaleAmtFix: unknown;
  mCogsFix: unknown;
  mSummerInvQty: unknown;
  mSummerInvAmt: unknown;
  mInvQtyFix: unknown;
  mInvAmtFix: unknown;
  mOpenQtyFix: unknown;
  mOpenAmtFix: unknown;
  mInQtyAll: unknown;
  mInAmtAll: unknown;
  mRetQtyAll: unknown;
  mRetAmtAll: unknown;
  mSaleQtyAll: unknown;
  mSaleAmtAll: unknown;
  mCogsAll: unknown;
  mInvQtyAll: unknown;
  mInvAmtAll: unknown;
  mOpenQtyAll: unknown;
  mOpenAmtAll: unknown;
  areaPyeong: unknown;
  baseInvQty: unknown;
  baseDisplayQty: unknown;
  baseRunQty: unknown;
  isCard: boolean;
  mNegQty: unknown;
  mNegAmt: unknown;
}

/** 복원 결과 — 칸반 + 큐레이션 + 수불오차(라이브파일 경로와 동형 입력). */
export interface RestoredStore {
  kanban: StoreKanbanRow[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
}

/**
 * DB FactStore 행들 → 매장 엔진 입력 복원.
 * 데이터열만 복원 후 buildStoreKanban 로 파생 재계산(엑셀 동형). 마스터·(−)재고·카드 재구성.
 */
export function factRowsToStore(allRows: FactStoreRow[], params: StoreParams): RestoredStore {
  // 점포행(코드) vs 집계 마스터행(전체/직영/중관/기타) 분리.
  const rows = allRows.filter((r) => !AGG_LABELS.includes(r.storeCode));
  const aggRows = allRows.filter((r) => AGG_LABELS.includes(r.storeCode));

  // 점포 데이터열만 채운 "RAW 대체 칸반"을 직접 구성 → 데이터열 세팅 후 파생 재계산.
  const dataKanban: StoreKanbanRow[] = rows.map((r) => {
    const base: Record<string, number> = {};
    for (const f of KANBAN_DATA_FIELDS) base[f] = 0;
    const k: StoreKanbanRow = {
      storeCode: r.storeCode,
      channel: r.channel as StoreChannel,
      storeName: r.storeName,
      saleMult: null,
      dotsFix: null,
      dotsAll: null,
      summerPct: null,
      dailyCogsFix: null,
      avgInvFix: null,
      dailyCogsAll: null,
      avgInvAll: null,
      inQtyFix: toNum(r.mInQtyFix),
      inAmtFix: toNum(r.mInAmtFix),
      retQtyFix: toNum(r.mRetQtyFix),
      retAmtFix: toNum(r.mRetAmtFix),
      saleQtyFix: toNum(r.mSaleQtyFix),
      saleAmtFix: toNum(r.mSaleAmtFix),
      cogsFix: toNum(r.mCogsFix),
      summerInvQty: toNum(r.mSummerInvQty),
      summerInvAmt: toNum(r.mSummerInvAmt),
      invQtyFix: toNum(r.mInvQtyFix),
      invAmtFix: toNum(r.mInvAmtFix),
      openQtyFix: toNum(r.mOpenQtyFix),
      openAmtFix: toNum(r.mOpenAmtFix),
      inQtyAll: toNum(r.mInQtyAll),
      inAmtAll: toNum(r.mInAmtAll),
      retQtyAll: toNum(r.mRetQtyAll),
      retAmtAll: toNum(r.mRetAmtAll),
      saleQtyAll: toNum(r.mSaleQtyAll),
      saleAmtAll: toNum(r.mSaleAmtAll),
      cogsAll: toNum(r.mCogsAll),
      invQtyAll: toNum(r.mInvQtyAll),
      invAmtAll: toNum(r.mInvAmtAll),
      openQtyAll: toNum(r.mOpenQtyAll),
      openAmtAll: toNum(r.mOpenAmtAll),
    };
    return k;
  });

  // 파생열 재계산(칸반 행단위 — buildStoreKanban 와 동일 산식). RAW 우회이므로 직접 derive.
  const C1 = params.workDays;
  const kanban = dataKanban.map((k) => deriveStoreLeaf(k, C1));

  // 큐레이션 + 수불오차 재구성.
  const curation: StoreCuration = { codes: [], masters: {} };
  const errors: StoreErrorIndex = { byCode: new Map(), byName: new Map() };
  let totalNegQty = 0;
  let totalNegAmt = 0;
  for (const r of rows) {
    const master: StoreMaster = {
      areaPyeong: toNumOrNull(r.areaPyeong),
      baseInvQty: toNumOrNull(r.baseInvQty),
      baseDisplayQty: toNumOrNull(r.baseDisplayQty),
      baseRunQty: toNumOrNull(r.baseRunQty),
    };
    curation.masters[r.storeCode] = master;
    if (r.isCard) curation.codes.push(r.storeCode);
    const neg = { negQty: toNumOrNull(r.mNegQty), negAmt: toNumOrNull(r.mNegAmt) };
    errors.byName.set(normalizeStoreName(r.storeName), neg);
    totalNegQty += neg.negQty ?? 0;
    totalNegAmt += neg.negAmt ?? 0;
  }
  // 집계 마스터행(전체/직영/중관/기타) → curation.masters + 코드키 (−)재고 복원.
  for (const a of aggRows) {
    curation.masters[a.storeCode] = {
      areaPyeong: toNumOrNull(a.areaPyeong),
      baseInvQty: toNumOrNull(a.baseInvQty),
      baseDisplayQty: toNumOrNull(a.baseDisplayQty),
      baseRunQty: toNumOrNull(a.baseRunQty),
    };
    errors.byCode.set(a.storeCode, {
      negQty: toNumOrNull(a.mNegQty),
      negAmt: toNumOrNull(a.mNegAmt),
    });
  }
  // 코드키 (−)재고 집계가 저장 안 됐으면(레거시) 점포 이름키 합으로 폴백.
  if (!errors.byCode.has("전체"))
    errors.byCode.set("전체", { negQty: totalNegQty, negAmt: totalNegAmt });

  return { kanban, curation, errors };
}

/** 단일 점포 리프 파생 재계산(buildStoreKanban leaf 산식과 동일). */
function deriveStoreLeaf(k: StoreKanbanRow, workDays: number): StoreKanbanRow {
  const safe = (a: number, b: number): number | null => (b === 0 ? null : a / b);
  k.dailyCogsFix = safe(k.cogsFix, workDays);
  k.dailyCogsAll = safe(k.cogsAll, workDays);
  k.avgInvFix = safe(k.invAmtFix + k.openAmtFix, 2);
  k.avgInvAll = safe(k.invAmtAll + k.openAmtAll, 2);
  k.saleMult = safe(k.saleQtyAll, k.inQtyAll);
  k.dotsFix = k.dailyCogsFix === null ? null : safe(k.avgInvFix ?? 0, k.dailyCogsFix);
  k.dotsAll = k.dailyCogsAll === null ? null : safe(k.avgInvAll ?? 0, k.dailyCogsAll);
  k.summerPct = safe(k.summerInvAmt, k.invAmtFix);
  return k;
}
