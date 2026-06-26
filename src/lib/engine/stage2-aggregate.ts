/**
 * Stage2 — 칸반 SKU행 → 4키 집계 팩트 + ROLLUP + 파생 재계산.
 *
 * 근거: spec §4(4키 SUMIFS)·§5(ROLLUP: 데이터=SUM·파생=재계산)·§6(R7 AM=AL/U).
 *
 *  - 데이터 19열 = 4키 GROUP BY 후 SUM. 상위 레벨 = 자식 SUM(부분집합).
 *  - 파생 10열 = 집계 후 행단위 재계산(비율 합산 금지).
 *  - R7: 지점체화비중 AM = AL/U 전행 통일(엑셀 AM274~280 R분모 버그는 엔진이 정답).
 *  - SS=봄+여름, FW=가을+겨울+공통.
 */

import {
  FW_SEASONS,
  SS_SEASONS,
  type FactKey,
  type FactLevel,
  type FactRow,
  type KanbanRow,
} from "./types";

/** 데이터 19지표 누산기(SUM 대상). */
interface BaseMetrics {
  sales: number;
  logiCost: number;
  rent: number;
  labor: number;
  freight: number;
  pack: number;
  ctrQty: number;
  ctrAmt: number;
  stoQty: number;
  stoAmt: number;
  openAll: number;
  openCtr: number;
  openSto: number;
  dailyOut: number;
  inQty: number;
  outQty: number;
  retQty: number;
  ctrDeadAmt: number;
  stoDeadAmt: number;
}

const ZERO_BASE: BaseMetrics = {
  sales: 0,
  logiCost: 0,
  rent: 0,
  labor: 0,
  freight: 0,
  pack: 0,
  ctrQty: 0,
  ctrAmt: 0,
  stoQty: 0,
  stoAmt: 0,
  openAll: 0,
  openCtr: 0,
  openSto: 0,
  dailyOut: 0,
  inQty: 0,
  outQty: 0,
  retQty: 0,
  ctrDeadAmt: 0,
  stoDeadAmt: 0,
};

/** 칸반 1행 → 19 데이터지표 매핑(칸반 letter → 대시보드 데이터열). */
function kanbanToBase(k: KanbanRow): BaseMetrics {
  return {
    sales: k.j_estSales, // E ← J
    logiCost: k.k_logiCost, // F ← K
    rent: k.bg_space, // K ← BG
    labor: k.bn_labor, // L ← BN
    freight: k.bt_freight, // M ← BT
    pack: k.bv_pack, // N ← BV
    ctrQty: k.y_ctrQty, // O ← Y
    ctrAmt: k.z_ctrAmt, // P ← Z
    stoQty: k.ae_stoQty, // T ← AE
    stoAmt: k.af_stoAmt, // U ← AF
    openAll: k.ak_openAll, // W ← AK
    openCtr: k.al_openCtr, // X ← AL
    openSto: k.am_openSto, // Y ← AM
    dailyOut: k.p_dailyOut, // AD ← P
    inQty: k.at_inQty, // AF ← AT
    outQty: k.az_outQty, // AG ← AZ
    retQty: k.bd_retQty, // AH ← BD
    ctrDeadAmt: k.ac_ctrDeadAmt, // AJ ← AC
    stoDeadAmt: k.ai_stoDeadAmt, // AL ← AI
  };
}

function addBase(a: BaseMetrics, b: BaseMetrics): BaseMetrics {
  const out = { ...ZERO_BASE };
  (Object.keys(out) as (keyof BaseMetrics)[]).forEach((kk) => {
    out[kk] = a[kk] + b[kk];
  });
  return out;
}

/** IFERROR(…,"") → null(분모0=공란). */
function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/**
 * 파생 10열 = 집계된 19지표로 행단위 재계산.
 * 대시보드 실측 수식:
 *   G=F/E · R=P+U · Z=(W+R)/2 · AA=(X+P)/2 · AB=(Y+U)/2 ·
 *   H=Z/AD · I=AA/AD · J=AB/AD · AK=AJ/P · AM=AL/U (R7 통일).
 */
function derive(b: BaseMetrics): Omit<FactRow, keyof FactKey | "level" | keyof BaseMetrics> {
  const invAmtTotal = b.ctrAmt + b.stoAmt; // R = P+U
  const avgInvTotal = (b.openAll + invAmtTotal) / 2; // Z = (W+R)/2
  const avgInvCtr = (b.openCtr + b.ctrAmt) / 2; // AA = (X+P)/2
  const avgInvSto = (b.openSto + b.stoAmt) / 2; // AB = (Y+U)/2
  return {
    logiRatio: safeDiv(b.logiCost, b.sales), // G
    dotsTotal: safeDiv(avgInvTotal, b.dailyOut), // H
    dotsCtr: safeDiv(avgInvCtr, b.dailyOut), // I
    dotsSto: safeDiv(avgInvSto, b.dailyOut), // J
    invAmtTotal,
    avgInvTotal,
    avgInvCtr,
    avgInvSto,
    deadCtrPct: safeDiv(b.ctrDeadAmt, b.ctrAmt), // AK
    deadStoPct: safeDiv(b.stoDeadAmt, b.stoAmt), // AM = AL/U (R7)
  };
}

/** 키 + 레벨 + base + 파생 → FactRow. */
function toFactRow(key: FactKey, level: FactLevel, b: BaseMetrics): FactRow {
  return { ...key, level, ...b, ...derive(b) };
}

/**
 * 칸반행 부분집합으로 base 누산(SUM 롤업).
 * 빈 문자열 키('')는 분류 미매칭 SKU — 그대로 보존(집계엔 포함, 4키 노드엔 안 잡힘).
 */
function sumBase(rows: KanbanRow[]): BaseMetrics {
  let acc = { ...ZERO_BASE };
  for (const k of rows) acc = addBase(acc, kanbanToBase(k));
  return acc;
}

/** 4키 GROUP BY 결과(아이템 리프). */
export function aggregateLeaf(kanban: KanbanRow[]): FactRow[] {
  const groups = new Map<string, KanbanRow[]>();
  for (const k of kanban) {
    const key = `${k.gender}|${k.newcarry}|${k.season}|${k.item}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(k);
  }
  const out: FactRow[] = [];
  for (const [, rows] of groups) {
    const r0 = rows[0]!;
    out.push(
      toFactRow(
        {
          gender: r0.gender,
          newcarry: r0.newcarry,
          season: r0.season,
          item: r0.item,
        },
        "L5_ITEM",
        sumBase(rows),
      ),
    );
  }
  return out;
}

/** 시즌 → SS/FW 그룹. */
export function seasonGroup(season: string): "SS" | "FW" | null {
  if ((SS_SEASONS as readonly string[]).includes(season)) return "SS";
  if ((FW_SEASONS as readonly string[]).includes(season)) return "FW";
  return null;
}

/**
 * 임의 키 부분집합으로 ROLLUP — predicate 로 칸반행 필터 → SUM → derive.
 * 상위 레벨 노드(전체/성별/신상이월/SS·FW/시즌소계) 모두 이 경로로 재계산.
 */
export function rollup(
  kanban: KanbanRow[],
  key: FactKey,
  level: FactLevel,
  predicate: (k: KanbanRow) => boolean,
): FactRow {
  const subset = kanban.filter(predicate);
  return toFactRow(key, level, sumBase(subset));
}

/** 분류 매칭된(4키 모두 비공백) 칸반행만 — 대시보드 집계 대상. */
function isClassified(k: KanbanRow): boolean {
  return !!(k.gender && k.newcarry && k.season && k.item);
}

/**
 * Stage2 전체 — 대시보드 281행과 동형인 FactRow 트리 산출.
 *
 * 구조(spec §5, 실측 대시보드):
 *   L0 전체  → 성별별 L1 → 신상/이월 L2 → SS/FW L3 → 시즌소계 L4 → 아이템리프 L5
 *   + 전체/성별 노드의 SS/FW 분해.
 *
 * MVP 검증 목표는 "임의 노드를 키로 재계산하면 엑셀 셀과 일치". 전체 트리를 평면 배열로.
 */
export interface FactTree {
  /** 모든 노드(레벨 혼재, 평면). 검증·드릴다운 공용. */
  rows: FactRow[];
  /** 4키 리프만(영속화 grain). */
  leaves: FactRow[];
}

const GENDERS = ["여성", "남성", "아동"] as const;
const NEWCARRIES = ["신상", "이월"] as const;
const SEASONS = ["봄", "여름", "가을", "겨울", "공통"] as const;
const ITEMS = [
  "상의류",
  "하의류",
  "액티브",
  "명품류",
  "잡화류",
  "내의류",
  "아동복",
] as const;

export function buildFactTree(kanban: KanbanRow[]): FactTree {
  const classified = kanban.filter(isClassified);
  const rows: FactRow[] = [];

  const k = (
    gender = "",
    newcarry = "",
    season = "",
    item = "",
  ): FactKey => ({ gender, newcarry, season, item });

  // L0 전체
  rows.push(rollup(classified, k(), "L0_TOTAL", () => true));
  // 전체 × SS/FW
  for (const g of ["SS", "FW"] as const) {
    rows.push(
      rollup(classified, k("", "", g === "SS" ? "SS시즌" : "FW시즌"), "L3_SSFW", (r) => seasonGroup(r.season) === g),
    );
  }
  // 전체 × 신상/이월 (× SS/FW)
  for (const nc of NEWCARRIES) {
    rows.push(rollup(classified, k("", nc), "L2_NEWCARRY", (r) => r.newcarry === nc));
    for (const g of ["SS", "FW"] as const) {
      rows.push(
        rollup(
          classified,
          k("", nc, g === "SS" ? "SS시즌" : "FW시즌"),
          "L3_SSFW",
          (r) => r.newcarry === nc && seasonGroup(r.season) === g,
        ),
      );
    }
  }

  // L1 성별 (× 신상이월 × SS/FW × 시즌소계 × 아이템리프)
  for (const g of GENDERS) {
    rows.push(rollup(classified, k(g), "L1_GENDER", (r) => r.gender === g));
    for (const sg of ["SS", "FW"] as const) {
      rows.push(
        rollup(
          classified,
          k(g, "", sg === "SS" ? "SS시즌" : "FW시즌"),
          "L3_SSFW",
          (r) => r.gender === g && seasonGroup(r.season) === sg,
        ),
      );
    }
    for (const nc of NEWCARRIES) {
      rows.push(
        rollup(classified, k(g, nc), "L2_NEWCARRY", (r) => r.gender === g && r.newcarry === nc),
      );
      for (const sg of ["SS", "FW"] as const) {
        rows.push(
          rollup(
            classified,
            k(g, nc, sg === "SS" ? "SS시즌" : "FW시즌"),
            "L3_SSFW",
            (r) => r.gender === g && r.newcarry === nc && seasonGroup(r.season) === sg,
          ),
        );
      }
      // L4 시즌소계 (3키) + L5 아이템리프 (4키)
      for (const s of SEASONS) {
        rows.push(
          rollup(
            classified,
            k(g, nc, s),
            "L4_SEASON",
            (r) => r.gender === g && r.newcarry === nc && r.season === s,
          ),
        );
        for (const it of ITEMS) {
          rows.push(
            rollup(
              classified,
              k(g, nc, s, it),
              "L5_ITEM",
              (r) =>
                r.gender === g &&
                r.newcarry === nc &&
                r.season === s &&
                r.item === it,
            ),
          );
        }
      }
    }
  }

  const leaves = rows.filter((r) => r.level === "L5_ITEM");
  return { rows, leaves };
}
