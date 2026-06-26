/**
 * Stage2 — 매장 칸반 점포행 → 3단 ROLLUP(전체→채널→점포) + 대시보드 행별 분기.
 *
 * 근거: spec 매장 §5(ROLLUP: 데이터=SUM·파생=재계산)·§3(대시보드 VLOOKUP+분기)·§4(가드).
 *
 *  - 데이터열 24개 = 채널 GROUP BY SUM → 전체 = 채널 SUM(엑셀 SUMIF/SUM 흡수).
 *  - 파생열 8개(D·E·F·G·O·V·AD·AI) = 집계 후 행단위 재계산(비율 합산 금지 = 가중평균).
 *  - 대시보드 행은 칸반을 VLOOKUP 재조회 → 칸반 KPI 재사용. 단 E·F·G·V·W 는
 *    행 종류(집계 vs 점포)에 따라 산식·키 분기(spec §6 AS-IS = 의도된 분기):
 *      E: 집계(전체/중관/기타)=칸반 F(전체재고일수) · 직영/점포=칸반 E(픽스재고일수)
 *      F: 집계 = O/T(전체재고량 분모) · 직영/점포 = O/P(픽스재고량 분모)
 *      G: 집계 = T/I · 직영/점포 = P/I
 *      V/W: 집계(전체/기타)=코드키 수불오차 · 직영=SUM(점포) · 중관=전체−직영 · 점포=이름키
 */

import { normalizeStoreName } from "./store-name";
import {
  KANBAN_DATA_FIELDS,
  STORE_CHANNELS,
  type KanbanDataField,
  type StoreChannel,
  type StoreDashRow,
  type StoreErrorIndex,
  type StoreKanbanRow,
  type StoreLevel,
  type StoreParams,
  type StoreCuration,
} from "./types";

/** IFERROR(분자/분모,"") → null. */
function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/** 칸반 데이터열 합산(채널/전체 롤업) — 가산 24열만 SUM, 파생은 행단위 재계산. */
function sumKanban(
  rows: StoreKanbanRow[],
  code: string,
  channel: StoreChannel | "전체",
  name: string,
  workDays: number,
): StoreKanbanRow {
  const acc = blankKanban(code, channel, name);
  for (const r of rows) {
    for (const f of KANBAN_DATA_FIELDS) {
      (acc[f] as number) += (r[f] as number) ?? 0;
    }
  }
  return deriveKanban(acc, workDays);
}

/** 빈 칸반행(데이터 0, 파생 null). */
function blankKanban(code: string, channel: StoreChannel | "전체", name: string): StoreKanbanRow {
  const z: Record<KanbanDataField, number> = {} as Record<KanbanDataField, number>;
  for (const f of KANBAN_DATA_FIELDS) z[f] = 0;
  return {
    storeCode: code,
    channel: channel as StoreChannel,
    storeName: name,
    saleMult: null,
    dotsFix: null,
    dotsAll: null,
    summerPct: null,
    dailyCogsFix: null,
    avgInvFix: null,
    dailyCogsAll: null,
    avgInvAll: null,
    ...z,
  };
}

/**
 * 칸반행 파생 재계산(집계 후 — spec §5-2). 파생열(O·AD·V·AI·D·E·F·G)은 합산 대상이 아니므로
 * 집계행은 합산된 데이터열로 재계산한다(비율 합산 금지 = 가중평균). O·AD 는 합산 N/AC 를 C1 로 나눔.
 */
function deriveKanban(k: StoreKanbanRow, workDays: number): StoreKanbanRow {
  k.dailyCogsFix = safeDiv(k.cogsFix, workDays); // O = N/C1
  k.dailyCogsAll = safeDiv(k.cogsAll, workDays); // AD = AC/C1
  k.avgInvFix = safeDiv(k.invAmtFix + k.openAmtFix, 2); // V = (S+U)/2
  k.avgInvAll = safeDiv(k.invAmtAll + k.openAmtAll, 2); // AI = (AF+AH)/2
  k.saleMult = safeDiv(k.saleQtyAll, k.inQtyAll); // D = AA/W
  k.dotsFix = k.dailyCogsFix === null ? null : safeDiv(k.avgInvFix ?? 0, k.dailyCogsFix); // E = V/O
  k.dotsAll = k.dailyCogsAll === null ? null : safeDiv(k.avgInvAll ?? 0, k.dailyCogsAll); // F = AI/AD
  k.summerPct = safeDiv(k.summerInvAmt, k.invAmtFix); // G = Q/S
  return k;
}

/** 트리 노드 — 칸반 집계 + 자식. */
export interface StoreTreeNode {
  id: string;
  label: string;
  level: StoreLevel;
  channel?: StoreChannel;
  /** 이 노드의 칸반 집계(데이터 SUM + 파생 재계산) — 엑셀 칸반 R8~43 동형. */
  kanban: StoreKanbanRow;
  children: StoreTreeNode[];
  isLeaf: boolean;
}

export interface StoreDashboardInput {
  params: StoreParams;
  curation: StoreCuration;
  errors: StoreErrorIndex;
}

export interface StoreDashboard {
  /** 루트(전체) 트리 — 전체→채널→점포 3단(칸반 집계). */
  root: StoreTreeNode;
  /** 대시보드 출력 행(집계 R4~7 + 점포 카드). 행별 분기·(−)재고 반영. */
  flatRows: StoreDashRow[];
}

/** 수불오차 코드키 조회(집계행 V/W). */
function negByCode(errors: StoreErrorIndex, code: string): { negQty: number | null; negAmt: number | null } {
  return errors.byCode.get(code) ?? { negQty: null, negAmt: null };
}
/** 수불오차 이름키 조회(점포행 V/W). */
function negByName(errors: StoreErrorIndex, name: string): { negQty: number | null; negAmt: number | null } {
  return errors.byName.get(normalizeStoreName(name)) ?? { negQty: null, negAmt: null };
}

/**
 * Stage2 메인 — 칸반 점포행 → 3단 트리 + 대시보드 행.
 */
export function buildStoreDashboard(
  kanban: StoreKanbanRow[],
  input: StoreDashboardInput,
): StoreDashboard {
  const { curation, errors } = input;
  const workDays = input.params.workDays;
  const div = input.params.weekRunDivisor;

  // ── 채널 GROUP BY ──
  const byChannel = new Map<StoreChannel, StoreKanbanRow[]>();
  for (const ch of STORE_CHANNELS) byChannel.set(ch, []);
  for (const k of kanban) byChannel.get(k.channel)?.push(k);

  // 채널 노드(데이터 SUM → 파생 재계산).
  const channelNodes: StoreTreeNode[] = STORE_CHANNELS.map((ch) => {
    const rows = byChannel.get(ch)!;
    const agg = sumKanban(rows, ch, ch, ch, workDays);
    const leaves: StoreTreeNode[] = rows.map((r) => ({
      id: `store:${r.storeCode}`,
      label: r.storeName || r.storeCode,
      level: "L2_STORE" as StoreLevel,
      channel: ch,
      kanban: r,
      children: [],
      isLeaf: true,
    }));
    return {
      id: `channel:${ch}`,
      label: ch,
      level: "L1_CHANNEL" as StoreLevel,
      channel: ch,
      kanban: agg,
      children: leaves,
      isLeaf: false,
    };
  });

  // 전체 = 채널 SUM (= 점포 전체 SUM 과 동일 — 엑셀 R8=SUM(R9:R11)).
  const totalAgg = sumKanban(kanban, "전체", "전체", "전체", workDays);
  const root: StoreTreeNode = {
    id: "ROOT",
    label: "전체",
    level: "L0_TOTAL",
    kanban: totalAgg,
    children: channelNodes,
    isLeaf: false,
  };

  // ── 대시보드 행(집계 R4~7 + 점포 카드 R8~) ──
  const flatRows: StoreDashRow[] = [];

  // 집계행: 전체·직영·중간관리·기타.
  const aggSpecs: Array<{ code: string; channel: string; node: StoreTreeNode }> = [
    { code: "전체", channel: "전체", node: root },
    ...STORE_CHANNELS.map((ch) => ({
      code: ch,
      channel: ch,
      node: channelNodes.find((c) => c.channel === ch)!,
    })),
  ];

  // 직영 채널 V/W = SUM(직영 점포). 중관 V/W = 전체−직영 역산(엑셀 V6=V4-V5).
  // 직영 점포 (−)재고 합 미리 계산(이름키).
  const directStores = byChannel.get("직영")!;
  const directNeg = directStores.reduce(
    (acc, s) => {
      const n = negByName(errors, s.storeName);
      // 카드 노출 점포(curation.codes)만 합산 — 엑셀 V5=SUM(V8:V21) = 카드 14점.
      if (curation.codes.includes(s.storeCode)) {
        acc.q += n.negQty ?? 0;
        acc.a += n.negAmt ?? 0;
      }
      return acc;
    },
    { q: 0, a: 0 },
  );

  for (const spec of aggSpecs) {
    const k = spec.node.kanban;
    const master = curation.masters[spec.code] ?? {
      areaPyeong: null,
      baseInvQty: null,
      baseDisplayQty: null,
      baseRunQty: null,
    };
    const isDirect = spec.code === "직영";
    // E: 직영=픽스재고일수(칸반 E) · 전체/중관/기타=전체재고일수(칸반 F).
    const dotsDays = isDirect ? k.dotsFix : k.dotsAll;
    // F: 직영=O/P(픽스재고량) · 그외=O/T(전체재고량).
    const seasonPct = isDirect
      ? safeDiv(k.summerInvQty, k.invQtyFix)
      : safeDiv(k.summerInvQty, k.invQtyAll);
    // G: 직영=P/I · 그외=T/I.
    const baseInv = master.baseInvQty ?? 0;
    const stockRatio = isDirect
      ? safeDiv(k.invQtyFix, baseInv)
      : safeDiv(k.invQtyAll, baseInv);

    // V/W (−)재고: 전체·기타=코드키 · 직영=SUM(카드 점포) · 중관=전체−직영.
    let neg: { negQty: number | null; negAmt: number | null };
    if (spec.code === "전체" || spec.code === "기타") {
      neg = negByCode(errors, spec.code);
    } else if (spec.code === "직영") {
      neg = { negQty: directNeg.q, negAmt: directNeg.a };
    } else {
      // 중간관리 = 전체 − 직영(엑셀 역산). 전체는 코드키.
      const total = negByCode(errors, "전체");
      neg = {
        negQty: total.negQty === null ? null : total.negQty - directNeg.q,
        negAmt: total.negAmt === null ? null : total.negAmt - directNeg.a,
      };
    }

    flatRows.push(
      makeDashRow(spec.code, spec.channel, "", spec.code === "전체" ? "L0_TOTAL" : "L1_CHANNEL", k, master, {
        dotsDays,
        seasonPct,
        stockRatio,
        neg,
        div,
      }),
    );
  }

  // 점포 카드행(curation.codes 순서). E·F·G = 픽스 분기(점포=직영과 동일 픽스식).
  const kanbanByCode = new Map<string, StoreKanbanRow>();
  for (const k of kanban) kanbanByCode.set(k.storeCode, k);
  for (const code of curation.codes) {
    const k = kanbanByCode.get(code);
    if (!k) continue;
    const master = curation.masters[code] ?? {
      areaPyeong: null,
      baseInvQty: null,
      baseDisplayQty: null,
      baseRunQty: null,
    };
    const baseInv = master.baseInvQty ?? 0;
    const neg = negByName(errors, k.storeName);
    flatRows.push(
      makeDashRow(code, k.channel, k.storeName, "L2_STORE", k, master, {
        dotsDays: k.dotsFix, // 점포 = 픽스 재고일수
        seasonPct: safeDiv(k.summerInvQty, k.invQtyFix), // O/P
        stockRatio: safeDiv(k.invQtyFix, baseInv), // P/I
        neg,
        div,
      }),
    );
  }

  return { root, flatRows };
}

/** 대시보드 1행 조립(측정 = 칸반 직참, 주판 = /div, 분기값 = 인자). */
function makeDashRow(
  code: string,
  channel: string,
  name: string,
  level: StoreLevel,
  k: StoreKanbanRow,
  master: { areaPyeong: number | null; baseInvQty: number | null; baseDisplayQty: number | null; baseRunQty: number | null },
  branch: {
    dotsDays: number | null;
    seasonPct: number | null;
    stockRatio: number | null;
    neg: { negQty: number | null; negAmt: number | null };
    div: number;
  },
): StoreDashRow {
  return {
    code,
    channel,
    name,
    level,
    saleMult: k.saleMult, // D ← 칸반 D
    dotsDays: branch.dotsDays, // E (분기)
    seasonPct: branch.seasonPct, // F (분기)
    stockRatio: branch.stockRatio, // G (분기)
    areaPyeong: master.areaPyeong,
    baseInvQty: master.baseInvQty,
    baseDisplayQty: master.baseDisplayQty,
    baseRunQty: master.baseRunQty,
    inQtyFix: k.inQtyFix, // L ← 칸반 H
    runQtyFix: branch.div === 0 ? null : k.saleQtyFix / branch.div, // M = N/3
    saleQtyFix: k.saleQtyFix, // N ← 칸반 L
    summerInvQty: k.summerInvQty, // O ← 칸반 P
    invQtyFix: k.invQtyFix, // P ← 칸반 R
    inQtyAll: k.inQtyAll, // Q ← 칸반 W
    runQtyAll: branch.div === 0 ? null : k.saleQtyAll / branch.div, // R = S/3
    saleQtyAll: k.saleQtyAll, // S ← 칸반 AA
    invQtyAll: k.invQtyAll, // T ← 칸반 AE
    negQty: branch.neg.negQty, // V
    negAmt: branch.neg.negAmt, // W
  };
}

/** 트리 평탄화(깊이우선). */
export function flattenStoreTree(
  node: StoreTreeNode,
  depth = 0,
): Array<{ node: StoreTreeNode; depth: number }> {
  const out: Array<{ node: StoreTreeNode; depth: number }> = [{ node, depth }];
  for (const c of node.children) out.push(...flattenStoreTree(c, depth + 1));
  return out;
}
