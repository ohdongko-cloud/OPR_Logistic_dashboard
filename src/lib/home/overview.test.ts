/**
 * 홈(개요) 집계·경보 산출 순수 로직 테스트.
 *
 * 입력 = 엔진 트리(TreeNode) · 매장 트리(StoreTreeNodeDto) · 주석 오버레이.
 * 출력 = 요약 KPI(루트) + 경보 카드(상위 N) + 데이터품질 가드.
 *
 * 가짜값 금지(작업지시) — 데이터 없으면 빈 배열·null. 임계는 기존 CRITICAL_THRESHOLDS 재사용.
 */

import { describe, it, expect } from "vitest";

import { type TreeNode } from "@/lib/engine";
import { type StoreTreeNodeDto } from "@/lib/engine-store";
import { type AnnotationDto } from "@/lib/annotations";

import {
  buildOverviewKpis,
  buildEngineAlerts,
  buildStoreAlerts,
  buildTargetMissAlerts,
  type HomeAlert,
} from "./overview";

// ── 픽스처 ──────────────────────────────────────────────────────────────

function factRow(over: Partial<Record<string, number | null>> = {}) {
  // FactRow 의 필수 수치 필드를 0 으로 채우고 over 로 덮어쓴다.
  const base = {
    level: "L0_TOTAL",
    gender: "",
    newcarry: "",
    season: "",
    item: "",
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
    inAmt: 0,
    outAmt: 0,
    retAmt: 0,
    logiRatio: null,
    dotsTotal: null,
    dotsCtr: null,
    dotsSto: null,
    invAmtTotal: 0,
    avgInvTotal: 0,
    avgInvCtr: 0,
    avgInvSto: 0,
    deadCtrPct: null,
    deadStoPct: null,
  };
  return { ...base, ...over } as unknown as TreeNode["metrics"];
}

function node(
  id: string,
  label: string,
  level: TreeNode["level"],
  metrics: TreeNode["metrics"],
  children: TreeNode[] = [],
): TreeNode {
  return {
    id,
    label,
    level,
    key: { gender: "", newcarry: "", season: "", item: "" },
    metrics,
    children,
    isLeaf: children.length === 0,
  };
}

// ── buildOverviewKpis ────────────────────────────────────────────────────

describe("buildOverviewKpis", () => {
  it("루트 metrics 에서 핵심 KPI(물류비율·센터재고일수·체화비중·매출)를 뽑는다", () => {
    const root = node(
      "ROOT",
      "전체",
      "L0_TOTAL",
      factRow({
        sales: 10_000_000_000,
        logiCost: 1_500_000_000,
        logiRatio: 0.15,
        dotsCtr: 80,
        ctrAmt: 5_000_000_000,
        ctrDeadAmt: 500_000_000,
        deadCtrPct: 0.1,
        dailyOut: 10_000_000,
      }),
    );
    const kpis = buildOverviewKpis(root, null);
    const ratio = kpis.find((k) => k.id === "logiRatio");
    expect(ratio?.value).toBe(0.15);
    expect(ratio?.suppressed).toBe(false);
    const sales = kpis.find((k) => k.id === "sales");
    expect(sales?.value).toBe(10_000_000_000);
  });

  it("희소 분모(매출 미미)면 물류비율 KPI 를 suppressed 로 표시한다(가짜값 금지)", () => {
    const root = node(
      "ROOT",
      "전체",
      "L0_TOTAL",
      factRow({ sales: 1000, logiCost: 1500, logiRatio: 1.5 }),
    );
    const kpis = buildOverviewKpis(root, null);
    const ratio = kpis.find((k) => k.id === "logiRatio");
    expect(ratio?.suppressed).toBe(true);
  });

  it("매장 루트가 있으면 판매배수·(−)재고 KPI 를 합친다", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow({ sales: 1e10, logiRatio: 0.1 }));
    const storeRoot: StoreTreeNodeDto = {
      id: "ROOT",
      label: "전체",
      level: "L0_TOTAL",
      metrics: {
        saleMult: 1.4,
        dotsFix: null,
        dotsAll: 100,
        summerPct: null,
        inQtyFix: 0,
        saleQtyFix: 0,
        cogsFix: 0,
        summerInvQty: 0,
        invQtyFix: 0,
        invAmtFix: 0,
        inQtyAll: 0,
        saleQtyAll: 0,
        invQtyAll: 0,
        invAmtAll: 0,
        dotsDays: 100,
        seasonPct: null,
        stockRatio: null,
        negQty: -120,
        negAmt: -3_000_000,
        areaPyeong: null,
        baseInvQty: null,
        dotsDaysDenom: 1e8,
        seasonPctDenom: 1000,
      },
      children: [],
      isLeaf: true,
    };
    const kpis = buildOverviewKpis(root, storeRoot);
    expect(kpis.find((k) => k.id === "saleMult")?.value).toBe(1.4);
    expect(kpis.find((k) => k.id === "negAmt")?.value).toBe(-3_000_000);
  });
});

// ── buildEngineAlerts (악성 체화) ──────────────────────────────────────────

describe("buildEngineAlerts", () => {
  it("체화비중이 임계 초과인 리프를 경보로 올린다(상위 N, 내림차순)", () => {
    const leafA = node(
      "여성|신상|봄|상의류",
      "상의류",
      "L5_ITEM",
      factRow({ ctrAmt: 3_000_000_000, ctrDeadAmt: 1_500_000_000, deadCtrPct: 0.5 }),
    );
    const leafB = node(
      "남성|이월|겨울|하의류",
      "하의류",
      "L5_ITEM",
      factRow({ ctrAmt: 2_000_000_000, ctrDeadAmt: 600_000_000, deadCtrPct: 0.3 }),
    );
    const leafOk = node(
      "여성|신상|여름|잡화류",
      "잡화류",
      "L5_ITEM",
      factRow({ ctrAmt: 2_000_000_000, ctrDeadAmt: 100_000_000, deadCtrPct: 0.05 }),
    );
    const root = node("ROOT", "전체", "L0_TOTAL", factRow(), [leafA, leafB, leafOk]);

    const alerts = buildEngineAlerts(root, 5);
    const dead = alerts.filter((a) => a.kind === "DEAD_STOCK");
    expect(dead).toHaveLength(2);
    // 내림차순(0.5 먼저).
    expect(dead[0].value).toBe(0.5);
    expect(dead[0].severity).toBe("high");
    expect(dead[0].href).toContain("/engine");
  });

  it("희소 분모(센터재고액 미미)인 체화비중은 경보로 올리지 않는다(가드)", () => {
    const noisy = node(
      "여성|신상|봄|상의류",
      "상의류",
      "L5_ITEM",
      factRow({ ctrAmt: 1000, ctrDeadAmt: 900, deadCtrPct: 0.9 }),
    );
    const root = node("ROOT", "전체", "L0_TOTAL", factRow(), [noisy]);
    const alerts = buildEngineAlerts(root, 5);
    expect(alerts.filter((a) => a.kind === "DEAD_STOCK")).toHaveLength(0);
  });

  it("물류비율이 임계 초과인 리프를 경보로 올린다", () => {
    const leaf = node(
      "여성|신상|봄|상의류",
      "상의류",
      "L5_ITEM",
      factRow({ sales: 3_000_000_000, logiCost: 1_200_000_000, logiRatio: 0.4 }),
    );
    const root = node("ROOT", "전체", "L0_TOTAL", factRow(), [leaf]);
    const alerts = buildEngineAlerts(root, 5);
    expect(alerts.some((a) => a.kind === "HIGH_RATIO" && a.value === 0.4)).toBe(true);
  });

  it("데이터 없으면 빈 배열(가짜값 금지)", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow(), []);
    expect(buildEngineAlerts(root, 5)).toEqual([]);
  });
});

// ── buildStoreAlerts ((−)마이너스 재고) ───────────────────────────────────

describe("buildStoreAlerts", () => {
  function storeLeaf(code: string, negAmt: number | null): StoreTreeNodeDto {
    return {
      id: code,
      label: code,
      level: "L2_STORE",
      storeCode: code,
      metrics: {
        saleMult: null,
        dotsFix: null,
        dotsAll: null,
        summerPct: null,
        inQtyFix: 0,
        saleQtyFix: 0,
        cogsFix: 0,
        summerInvQty: 0,
        invQtyFix: 0,
        invAmtFix: 0,
        inQtyAll: 0,
        saleQtyAll: 0,
        invQtyAll: 0,
        invAmtAll: 0,
        dotsDays: null,
        seasonPct: null,
        stockRatio: null,
        negQty: negAmt == null ? null : -10,
        negAmt,
        areaPyeong: null,
        baseInvQty: null,
        dotsDaysDenom: null,
        seasonPctDenom: null,
      },
      children: [],
      isLeaf: true,
    };
  }

  it("(−)재고 금액이 있는 점포를 절대값 내림차순 경보로 올린다", () => {
    const root: StoreTreeNodeDto = {
      ...storeLeaf("ROOT", null),
      id: "ROOT",
      label: "전체",
      level: "L0_TOTAL",
      isLeaf: false,
      children: [storeLeaf("S001", -5_000_000), storeLeaf("S002", -12_000_000), storeLeaf("S003", 0)],
    };
    const alerts = buildStoreAlerts(root, 5);
    const neg = alerts.filter((a) => a.kind === "NEG_STOCK");
    expect(neg).toHaveLength(2);
    expect(neg[0].value).toBe(-12_000_000); // 절대값 큰 것 먼저
    expect(neg[0].href).toContain("/store");
  });

  it("(−)재고 없으면 빈 배열", () => {
    const root: StoreTreeNodeDto = {
      ...storeLeaf("ROOT", null),
      id: "ROOT",
      label: "전체",
      level: "L0_TOTAL",
      isLeaf: false,
      children: [storeLeaf("S001", 0), storeLeaf("S002", null)],
    };
    expect(buildStoreAlerts(root, 5).filter((a) => a.kind === "NEG_STOCK")).toEqual([]);
  });
});

// ── buildTargetMissAlerts (목표 미달) ─────────────────────────────────────

describe("buildTargetMissAlerts", () => {
  function targetAnno(metricCode: string, numValue: number): AnnotationDto {
    return {
      id: `t-${metricCode}`,
      kind: "TARGET",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      gender: null,
      newcarry: null,
      season: null,
      item: null,
      metricCode,
      numValue,
      textValue: null,
      authorEmail: "a@b.c",
      updatedAt: "2026-06-01T00:00:00Z",
    };
  }

  it("비용성 지표(물류비율)가 목표 초과면 목표 미달 경보", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow({ sales: 1e10, logiRatio: 0.18 }));
    const alerts = buildTargetMissAlerts(root, [targetAnno("logiRatio", 0.12)], 5);
    const miss = alerts.find((a) => a.kind === "TARGET_MISS");
    expect(miss).toBeTruthy();
    expect(miss?.severity).toBe("high");
  });

  it("목표 달성(현재 ≤ 목표)이면 경보 없음", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow({ sales: 1e10, logiRatio: 0.1 }));
    const alerts = buildTargetMissAlerts(root, [targetAnno("logiRatio", 0.12)], 5);
    expect(alerts.filter((a) => a.kind === "TARGET_MISS")).toEqual([]);
  });

  it("매출(높을수록 좋음) 목표 미달이면 경보", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow({ sales: 8e9, logiRatio: 0.1 }));
    const alerts = buildTargetMissAlerts(root, [targetAnno("sales", 1e10)], 5);
    expect(alerts.some((a) => a.kind === "TARGET_MISS")).toBe(true);
  });

  it("주석 없으면 빈 배열", () => {
    const root = node("ROOT", "전체", "L0_TOTAL", factRow({ sales: 1e10 }));
    expect(buildTargetMissAlerts(root, [], 5)).toEqual([]);
  });
});

// ── 종합: 경보 정렬·상한 ──────────────────────────────────────────────────

describe("HomeAlert 형상", () => {
  it("필수 필드(kind·title·href·severity)를 갖는다", () => {
    const leaf = node(
      "여성|신상|봄|상의류",
      "상의류",
      "L5_ITEM",
      factRow({ ctrAmt: 3e9, ctrDeadAmt: 1.5e9, deadCtrPct: 0.5 }),
    );
    const root = node("ROOT", "전체", "L0_TOTAL", factRow(), [leaf]);
    const alerts: HomeAlert[] = buildEngineAlerts(root, 5);
    const a = alerts[0];
    expect(a.kind).toBeTruthy();
    expect(a.title).toBeTruthy();
    expect(a.href).toMatch(/^\//);
    expect(["high", "medium"]).toContain(a.severity);
  });
});
