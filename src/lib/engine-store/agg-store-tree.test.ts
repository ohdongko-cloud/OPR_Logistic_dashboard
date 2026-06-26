/**
 * 매장 드릴다운 트리(API 응답형) — 채널 필터 + 직렬화 계약 단위테스트(합성 데이터).
 *
 * 실파일 의존 없이 buildStoreAggTree 의 트리 구조·필터·라벨·직렬화를 검증.
 */

import { describe, expect, it } from "vitest";

import { buildStoreAggTree } from "./agg-store-tree";
import { buildStoreDashboard } from "./stage2-store-tree";
import { MONTH_STORE_PARAMS, type StoreKanbanRow } from "./types";

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
