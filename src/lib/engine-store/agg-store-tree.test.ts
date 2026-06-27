/**
 * 매장 드릴다운 트리(API 응답형) — 채널 필터 + 직렬화 계약 단위테스트(합성 데이터).
 *
 * 실파일 의존 없이 buildStoreAggTree 의 트리 구조·필터·라벨·직렬화를 검증.
 */

import { describe, expect, it } from "vitest";

import { buildStoreAggTree } from "./agg-store-tree";
import { storeRatioDenom, storeRatioMin } from "./ratio-guard";
import { buildStoreDashboard } from "./stage2-store-tree";
import { MONTH_STORE_PARAMS, type StoreKanbanRow } from "./types";
import { guardRatio } from "@/lib/metric-guard";

/** 최소 칸반행(데이터열만 지정, 나머지 0/파생 빌더가 채움 — 여기선 직접 구성). */
function leaf(code: string, channel: StoreKanbanRow["channel"], name: string, qty: number): StoreKanbanRow {
  return {
    storeCode: code,
    channel,
    storeName: name,
    saleMult: null,
    dotsFix: null,
    dotsAll: null,
    summerPct: null,
    inQtyFix: qty,
    inAmtFix: 0,
    retQtyFix: 0,
    retAmtFix: 0,
    saleQtyFix: 0,
    saleAmtFix: 0,
    cogsFix: 0,
    dailyCogsFix: null,
    summerInvQty: 0,
    summerInvAmt: 0,
    invQtyFix: 0,
    invAmtFix: 0,
    openQtyFix: 0,
    openAmtFix: 0,
    avgInvFix: null,
    inQtyAll: 0,
    inAmtAll: 0,
    retQtyAll: 0,
    retAmtAll: 0,
    saleQtyAll: 0,
    saleAmtAll: 0,
    cogsAll: 0,
    dailyCogsAll: null,
    invQtyAll: 0,
    invAmtAll: 0,
    openQtyAll: 0,
    openAmtAll: 0,
    avgInvAll: null,
  };
}

const KANBAN: StoreKanbanRow[] = [
  leaf("A1", "직영", "직영점1", 10),
  leaf("A2", "직영", "직영점2", 20),
  leaf("B1", "중간관리", "중관점1", 5),
  leaf("C1", "기타", "기타점1", 1),
];

const INPUT = {
  params: MONTH_STORE_PARAMS,
  curation: {
    codes: ["A1", "A2"],
    masters: {
      A1: { areaPyeong: 100, baseInvQty: 1000, baseDisplayQty: 800, baseRunQty: 50 },
    },
  },
  errors: { byCode: new Map(), byName: new Map() },
};

describe("buildStoreAggTree — 매장 드릴다운(전체→채널→점포)", () => {
  it("루트=전체, 자식=3채널, 각 채널 아래 점포 리프", () => {
    const dash = buildStoreDashboard(KANBAN, INPUT);
    const tree = buildStoreAggTree(dash, {});
    expect(tree.label).toContain("전체");
    expect(tree.level).toBe("L0_TOTAL");
    const labels = tree.children.map((c) => c.label);
    expect(labels).toEqual(["직영", "중간관리", "기타"]);
    const direct = tree.children.find((c) => c.label === "직영")!;
    expect(direct.children.map((c) => c.label).sort()).toEqual(["직영점1", "직영점2"]);
    expect(direct.children.every((c) => c.isLeaf)).toBe(true);
  });

  it("전체 입고량 = 채널 합 = 점포 합(가산 롤업)", () => {
    const dash = buildStoreDashboard(KANBAN, INPUT);
    const tree = buildStoreAggTree(dash, {});
    expect(tree.metrics.inQtyFix).toBe(36); // 10+20+5+1
    const direct = tree.children.find((c) => c.label === "직영")!;
    expect(direct.metrics.inQtyFix).toBe(30); // 10+20
  });

  it("채널 필터 = 그 채널만 진입(루트 라벨에 채널 반영)", () => {
    const dash = buildStoreDashboard(KANBAN, INPUT);
    const tree = buildStoreAggTree(dash, { channel: "직영" });
    expect(tree.label).toContain("직영");
    // 직영 채널만 자식(점포)로.
    expect(tree.children.map((c) => c.label).sort()).toEqual(["직영점1", "직영점2"]);
    expect(tree.metrics.inQtyFix).toBe(30);
  });

  it("응답은 JSON 직렬화 안전(number|null|string 만)", () => {
    const dash = buildStoreDashboard(KANBAN, INPUT);
    const tree = buildStoreAggTree(dash, {});
    const round = JSON.parse(JSON.stringify(tree));
    expect(round.metrics.inQtyFix).toBe(36);
    expect(round.children.length).toBe(3);
  });
});

/**
 * 비율 가드 분모 carry 회귀 — 집계행(전체/중관/기타)은 전체분모(cogsAll/invQtyAll),
 * 직영/점포는 픽스분모(cogsFix/invQtyFix). 고정 cogsFix·invAmtFix 매핑이던 구결함 차단.
 */
describe("매장 가드 분모 carry — 집계행 정상값 비가림·희소 보류", () => {
  /** cogs·재고를 갖춘 점포행(픽스/전체 분모를 다르게). */
  function richLeaf(
    code: string,
    channel: StoreKanbanRow["channel"],
    name: string,
    o: { cogsFix: number; cogsAll: number; invQtyFix: number; invQtyAll: number; summerInvQty: number },
  ): StoreKanbanRow {
    const base = leaf(code, channel, name, 0);
    return {
      ...base,
      cogsFix: o.cogsFix,
      cogsAll: o.cogsAll,
      invQtyFix: o.invQtyFix,
      invQtyAll: o.invQtyAll,
      summerInvQty: o.summerInvQty,
      // 재고액(픽스)은 일부러 크게 — 구결함(invAmtFix 분모 amount)이면 시즌비중을 통과시켰을 값.
      invAmtFix: 50_000_000,
    };
  }

  // 중간관리 채널: 픽스 cogs/재고는 미미하지만 전체 cogs/재고는 충분.
  const KANBAN2: StoreKanbanRow[] = [
    richLeaf("M1", "중간관리", "중관점1", {
      cogsFix: 100, // 일평균픽스원가 ≈ 4.8원/일 (미미)
      cogsAll: 200_000_000, // 일평균전체원가 ≈ 9.5M/일 (충분)
      invQtyFix: 2, // 픽스재고량 2개(미미)
      invQtyAll: 8_000, // 전체재고량 8천개(충분)
      summerInvQty: 2_000,
    }),
  ];
  const INPUT2 = {
    params: MONTH_STORE_PARAMS,
    curation: { codes: [], masters: {} },
    errors: { byCode: new Map(), byName: new Map() },
  };

  it("중간관리 집계행: 전체분모가 충분하면 재고일수·시즌비중 비가림(과잉보류 차단)", () => {
    const dash = buildStoreDashboard(KANBAN2, INPUT2);
    const tree = buildStoreAggTree(dash, {});
    const mid = tree.children.find((c) => c.label === "중간관리")!;
    // carry 분모 = 전체분모(일평균전체원가·전체재고량) — 충분.
    expect(storeRatioDenom("dotsDays", mid.metrics)).toBeGreaterThan(1_000_000);
    expect(storeRatioDenom("seasonPct", mid.metrics)).toBe(8_000);

    const daysMin = storeRatioMin("dotsDays")!;
    const seasonMin = storeRatioMin("seasonPct")!;
    // 정상값 비가림(suppressed=false).
    expect(
      guardRatio(mid.metrics.dotsDays, storeRatioDenom("dotsDays", mid.metrics), daysMin).suppressed,
    ).toBe(false);
    expect(
      guardRatio(mid.metrics.seasonPct, storeRatioDenom("seasonPct", mid.metrics), seasonMin).suppressed,
    ).toBe(false);
  });

  it("희소 집계행: 전체분모도 미미하면 보류(false-negative 차단)", () => {
    const sparse: StoreKanbanRow[] = [
      richLeaf("M2", "중간관리", "중관점2", {
        cogsFix: 100,
        cogsAll: 100, // 일평균전체원가도 미미
        invQtyFix: 2,
        invQtyAll: 3, // 전체재고량도 미미(수개)
        summerInvQty: 2,
      }),
    ];
    const dash = buildStoreDashboard(sparse, INPUT2);
    const tree = buildStoreAggTree(dash, {});
    const mid = tree.children.find((c) => c.label === "중간관리")!;
    const seasonMin = storeRatioMin("seasonPct")!;
    // 재고량(수량) 3개 < 임계 50 → 보류. (구결함: 재고액 분모면 통과시켰을 것.)
    expect(
      guardRatio(mid.metrics.seasonPct, storeRatioDenom("seasonPct", mid.metrics), seasonMin).suppressed,
    ).toBe(true);
  });
});
