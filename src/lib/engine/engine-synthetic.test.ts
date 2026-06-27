/**
 * 엔진 합성 픽스처 단위 테스트(실데이터 무관 — CI 안전).
 *
 * 목적: SUMIF 흡수·VLOOKUP·물류비 안분 순서의존·4키 집계·파생 재계산·SS/FW·R7 을
 *       작은 결정적 입력으로 검증. 실값은 손계산으로 확정.
 */

import { describe, expect, it } from "vitest";

import { type RawRowRecord } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { buildDimClassMaps, lookupGender, lookupItem } from "./dim-class";
import { extractLogiCostTotals } from "./logi-cost";
import { buildKanban } from "./stage1-kanban";
import {
  aggregateLeaf,
  buildFactTree,
  rollup,
  seasonGroup,
} from "./stage2-aggregate";
import { MONTH_ANCHORS } from "./types";

// ── 헬퍼: RawRowRecord 생성 ──
function raw(
  sheetType: SheetType,
  rowIndex: number,
  skuKey: string,
  data: Record<string, string | number | null>,
): RawRowRecord {
  return { sheetType, rowIndex, skuKey, data };
}

// ── 합성 #분류 마스터 ──
const classRows: RawRowRecord[] = [
  // 성별 C(대구분)→D(대조합), 아이템 S(대분류)→T(대조합)
  raw("분류", 0, "", { C: "여성", D: "여성", S: "잡화", T: "잡화류", U: "잡화류" }),
  raw("분류", 1, "", { C: "골드여성", D: "여성", S: "상의", T: "상의류", U: "상의류" }),
  raw("분류", 2, "", { C: "남성", D: "남성", S: "스포츠", T: "액티브", U: "캐쥬얼" }),
  raw("분류", 3, "", { C: "아동", D: "아동", S: "아동", T: "아동복", U: "아동" }),
];

describe("dim-class — VLOOKUP 재현", () => {
  const maps = buildDimClassMaps(classRows);

  it("성별 VLOOKUP: 골드여성→여성(병합), 미스→null", () => {
    expect(lookupGender(maps, "여성")).toBe("여성");
    expect(lookupGender(maps, "골드여성")).toBe("여성");
    expect(lookupGender(maps, "없음")).toBeNull();
  });

  it("아이템 VLOOKUP: 대분류→대조합(T), 스포츠→액티브", () => {
    expect(lookupItem(maps, "잡화")).toBe("잡화류");
    expect(lookupItem(maps, "스포츠")).toBe("액티브");
    expect(lookupItem(maps, "상의")).toBe("상의류");
  });
});

describe("logi-cost — 라벨 매칭 추출", () => {
  it("(임차+관리비)·수도광열비·정직원·도급·배송비·포장비·기타 → 7총액", () => {
    const logiRows: RawRowRecord[] = [
      raw("물류비예측", 0, "", { A: "물류비 합계", B: 1000 }),
      raw("물류비예측", 1, "", { A: "공간비", B: 100 }),
      raw("물류비예측", 2, "", { A: "(임차+관리비)", B: 100 }),
      raw("물류비예측", 3, "", { A: "정직원", B: 30 }),
      raw("물류비예측", 4, "", { A: "도급", B: 70 }),
      raw("물류비예측", 5, "", { A: "배송비", B: 50 }),
      raw("물류비예측", 6, "", { A: "수도광열비", B: 10 }),
      raw("물류비예측", 7, "", { A: "포장비", B: 8 }),
      raw("물류비예측", 8, "", { A: "기타", B: 12 }),
    ];
    const t = extractLogiCostTotals(logiRows);
    expect(t).toEqual({
      rent: 100, // (임차+관리비) 우선
      receive: 10,
      staff: 30,
      outsource: 70,
      freight: 50,
      box: 8,
      material: 12,
    });
  });
});

describe("Stage1 — 칸반 SUMIF 흡수 + 물류비 안분(순서의존)", () => {
  // 2 SKU: A(여성·신상·봄·잡화), B(남성·이월·여름·스포츠)
  // 매출상세: H=매출액, I=원가, J=수량. 분류컬럼 O/R/T/U.
  const records: Partial<Record<SheetType, RawRowRecord[]>> = {
    분류: classRows,
    물류비예측: [
      raw("물류비예측", 0, "", { A: "(임차+관리비)", B: 1000 }),
      raw("물류비예측", 1, "", { A: "수도광열비", B: 200 }),
      raw("물류비예측", 2, "", { A: "정직원", B: 300 }),
      raw("물류비예측", 3, "", { A: "도급", B: 700 }),
      raw("물류비예측", 4, "", { A: "배송비", B: 500 }),
      raw("물류비예측", 5, "", { A: "포장비", B: 80 }),
      raw("물류비예측", 6, "", { A: "기타", B: 120 }),
    ],
    매출상세: [
      // SKU A — 두 행(SUMIF 합산 확인): 매출액 100+50=150, 원가 60, 수량 3
      raw("매출상세", 0, "A", { H: 100, I: 40, J: 2, O: "여성", R: "잡화", T: "봄", U: "신상" }),
      raw("매출상세", 1, "A", { H: 50, I: 20, J: 1, O: "여성", R: "잡화", T: "봄", U: "신상" }),
      raw("매출상세", 2, "B", { H: 200, I: 120, J: 4, O: "남성", R: "스포츠", T: "여름", U: "이월" }),
    ],
    물류재고: [
      // Y=재고수량(H), I=재고액. SKU A: qty 10, amt 1000. SKU B: qty 30, amt 3000.
      raw("물류재고", 0, "A", { H: 10, I: 1000, X: 2, Y: 100, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
      raw("물류재고", 1, "B", { H: 30, I: 3000, X: 5, Y: 500, Q: "남성", T: "스포츠", V: "여름", W: "이월" }),
    ],
    점재고: [
      raw("점재고", 0, "A", { H: 5, I: 500, X: 1, Y: 50, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
      raw("점재고", 1, "B", { H: 15, I: 1500, X: 3, Y: 300, Q: "남성", T: "스포츠", V: "여름", W: "이월" }),
    ],
    기초재고_센터: [
      raw("기초재고_센터", 0, "A", { I: 800, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
      raw("기초재고_센터", 1, "B", { I: 2000, Q: "남성", T: "스포츠", V: "여름", W: "이월" }),
    ],
    기초재고_지점: [
      raw("기초재고_지점", 0, "A", { I: 400, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
      raw("기초재고_지점", 1, "B", { I: 1200, Q: "남성", T: "스포츠", V: "여름", W: "이월" }),
    ],
    센터입출고: [
      // H=입고액, I=입고량, J=반품액, K=반품량, L=출고액, M=출고량. 분류 R/U/W/X.
      raw("센터입출고", 0, "A", { H: 900, I: 9, J: 100, K: 1, L: 800, M: 8, R: "여성", U: "잡화", W: "봄", X: "신상" }),
      raw("센터입출고", 1, "B", { H: 1800, I: 18, J: 200, K: 2, L: 1600, M: 16, R: "남성", U: "스포츠", W: "여름", X: "이월" }),
    ],
  };

  const kanban = buildKanban({ records, anchors: MONTH_ANCHORS });
  const A = kanban.find((r) => r.skuKey === "A")!;
  const B = kanban.find((r) => r.skuKey === "B")!;

  it("SKU 유니버스·분류·VLOOKUP", () => {
    expect(kanban.length).toBe(2);
    expect(A.gender).toBe("여성");
    expect(A.item).toBe("잡화류");
    expect(A.season).toBe("봄");
    expect(A.newcarry).toBe("신상");
    expect(B.gender).toBe("남성");
    expect(B.item).toBe("액티브"); // 스포츠→액티브
  });

  it("SUMIF 흡수: 매출액=150(100+50)·수량=3·원가=60", () => {
    expect(A.n_sales).toBe(150);
    expect(A.m_qty).toBe(3);
    expect(A.o_cogs).toBe(60);
  });

  it("추정매출 J=(N/21)*30*1.22 · 일평균소진 P=O/21", () => {
    expect(A.j_estSales).toBeCloseTo((150 / 21) * 30 * 1.22, 6);
    expect(A.p_dailyOut).toBeCloseTo(60 / 21, 6);
  });

  it("센터입출고 H=금액/I=수량 역전: 입고금액=900·입고수량=9", () => {
    expect(A.au_inAmt).toBe(900);
    expect(A.at_inQty).toBe(9);
    expect(A.ba_outAmt).toBe(800);
    expect(A.az_outQty).toBe(8);
    expect(A.bd_retQty).toBe(1);
    // AW 입출반 합계수량 = 출고8+반품1+입고9 = 18
    expect(A.aw_flowQty).toBe(18);
  });

  it("물류비 안분(순서의존): 임차=BI8*AA(Y/ΣY)·운반=(AZ+BD)/Σ(AZ+BD)*BT8", () => {
    // ΣY(재고수량 물류) = 10 + 30 = 40. AA_A = 10/40 = 0.25, AA_B = 0.75
    expect(A.aa_ctrAmtPct).toBeCloseTo(0.25, 9);
    expect(B.aa_ctrAmtPct).toBeCloseTo(0.75, 9);
    // 임차 BI = 1000*AA. A=250, B=750
    expect(A.bi_rent).toBeCloseTo(250, 6);
    expect(B.bi_rent).toBeCloseTo(750, 6);
    // 수광 BK = 200*AA. A=50
    expect(A.bk_receive).toBeCloseTo(50, 6);
    // 공간비 BG = BI+BK = 300
    expect(A.bg_space).toBeCloseTo(300, 6);

    // AW: A=18, B=36 → ΣAW=54. AY_A=18/54=1/3
    expect(A.ay_flowPct).toBeCloseTo(18 / 54, 9);
    // 도급 BP=700*AY, 정직원 BR=300*AY → 인건비 BN=(700+300)*AY=1000/3
    expect(A.bn_labor).toBeCloseTo(1000 * (18 / 54), 6);

    // 운반 BT = (AZ+BD)/Σ(AZ+BD)*500. A:(8+1)=9, B:(16+2)=18 → Σ=27. A=9/27*500
    expect(A.bt_freight).toBeCloseTo((9 / 27) * 500, 6);

    // 포장 BV = (박스80+부자재120)*AY = 200*AY
    expect(A.bv_pack).toBeCloseTo(200 * (18 / 54), 6);

    // K = BG+BN+BT+BV
    expect(A.k_logiCost).toBeCloseTo(
      A.bg_space + A.bn_labor + A.bt_freight + A.bv_pack,
      6,
    );
  });

  it("4키 집계 + 파생 재계산(R=P+U·Z=(W+R)/2·G=F/E)", () => {
    const leaves = aggregateLeaf(kanban);
    const leafA = leaves.find(
      (r) => r.gender === "여성" && r.item === "잡화류",
    )!;
    // 데이터지표
    expect(leafA.ctrAmt).toBe(1000); // P ← Z(물류재고액)
    expect(leafA.stoAmt).toBe(500); // U ← AF(점재고액)
    expect(leafA.openAll).toBe(800 + 400); // W = 센터800+지점400
    // 파생 R=P+U=1500
    expect(leafA.invAmtTotal).toBe(1500);
    // Z=(W+R)/2 = (1200+1500)/2 = 1350
    expect(leafA.avgInvTotal).toBe(1350);
    // G=F/E
    expect(leafA.logiRatio).toBeCloseTo(leafA.logiCost / leafA.sales, 9);
  });

  it("R7: 지점체화비중 AM = AL/U(지점체화금액/점포재고액)", () => {
    const leaves = aggregateLeaf(kanban);
    const leafA = leaves.find((r) => r.item === "잡화류")!;
    // stoDeadAmt(AI)=50, stoAmt(AF)=500 → 50/500=0.1
    expect(leafA.deadStoPct).toBeCloseTo(50 / 500, 9);
  });

  it("C10: 입출반 금액(inAmt/outAmt/retAmt) FactRow 에 SUM 롤업 — 슬5 c20/c22/c24 파생", () => {
    const leaves = aggregateLeaf(kanban);
    const leafA = leaves.find((r) => r.gender === "여성" && r.item === "잡화류")!;
    // SKU A 단독 집계: 입고금액 AU=900 · 출고금액 BA=800 · 반품금액 BE=100.
    expect(leafA.inAmt).toBe(900);
    expect(leafA.outAmt).toBe(800);
    expect(leafA.retAmt).toBe(100);
    // 전체 롤업 = A(여성)+B(남성) 금액 합(가산 정합).
    const total = rollup(kanban, { gender: "", newcarry: "", season: "", item: "" }, "L0_TOTAL", () => true);
    expect(total.inAmt).toBe(900 + 1800); // B 입고금액 H=1800
    expect(total.outAmt).toBe(800 + 1600); // B 출고금액 L=1600
    expect(total.retAmt).toBe(100 + 200); // B 반품금액 J=200
  });

  it("파생 분모0 → null(공란)", () => {
    const empty = rollup(kanban, { gender: "X", newcarry: "", season: "", item: "" }, "L5_ITEM", () => false);
    expect(empty.logiRatio).toBeNull();
    expect(empty.deadStoPct).toBeNull();
    expect(empty.invAmtTotal).toBe(0);
  });
});

describe("Stage2 — SS/FW 그룹 + 롤업 정합", () => {
  it("seasonGroup: 봄·여름→SS / 가을·겨울·공통→FW", () => {
    expect(seasonGroup("봄")).toBe("SS");
    expect(seasonGroup("여름")).toBe("SS");
    expect(seasonGroup("가을")).toBe("FW");
    expect(seasonGroup("겨울")).toBe("FW");
    expect(seasonGroup("공통")).toBe("FW");
    expect(seasonGroup("없음")).toBeNull();
  });

  it("전체(L0) = 리프 SUM (데이터지표 가산 무결성)", () => {
    // 4 SKU across genders/seasons
    const classRows2 = classRows;
    const records: Partial<Record<SheetType, RawRowRecord[]>> = {
      분류: classRows2,
      물류비예측: [],
      매출상세: [
        raw("매출상세", 0, "A", { H: 100, I: 50, J: 1, O: "여성", R: "잡화", T: "봄", U: "신상" }),
        raw("매출상세", 1, "B", { H: 200, I: 80, J: 2, O: "남성", R: "스포츠", T: "여름", U: "이월" }),
        raw("매출상세", 2, "C", { H: 300, I: 90, J: 3, O: "아동", R: "아동", T: "가을", U: "신상" }),
        raw("매출상세", 3, "D", { H: 400, I: 99, J: 4, O: "여성", R: "잡화", T: "겨울", U: "이월" }),
      ],
    };
    const kanban = buildKanban({ records });
    const tree = buildFactTree(kanban);
    const total = tree.rows.find((r) => r.level === "L0_TOTAL")!;
    const leafSum = tree.leaves.reduce((s, r) => s + r.sales, 0);
    expect(total.sales).toBeCloseTo(leafSum, 6);
    // SS = 봄+여름 리프 합
    const ss = tree.rows.find((r) => r.level === "L3_SSFW" && r.season === "SS시즌" && !r.gender && !r.newcarry)!;
    const ssExpect = tree.leaves
      .filter((r) => seasonGroup(r.season) === "SS")
      .reduce((s, r) => s + r.sales, 0);
    expect(ss.sales).toBeCloseTo(ssExpect, 6);
  });
});
