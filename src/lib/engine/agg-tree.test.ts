/**
 * 드릴다운 트리 빌더 단위 테스트(합성 — CI 안전).
 *
 * 검증: ① 5단계 중첩 구조 ② 루트=리프 SUM 무결성 ③ 필터 진입점 점프
 *       ④ 노드값=검증된 rollup 과 동일(엑셀 동형 유지) ⑤ SKU 상세.
 */

import { describe, expect, it } from "vitest";

import { type RawRowRecord } from "@/lib/ingest/parse-workbook";
import { type SheetType } from "@/lib/ingest/sheet-types";

import { buildDrilldownTree, flattenTree, skuDetailsFor } from "./agg-tree";
import { buildKanban } from "./stage1-kanban";
import { rollup } from "./stage2-aggregate";

function raw(
  sheetType: SheetType,
  rowIndex: number,
  skuKey: string,
  data: Record<string, string | number | null>,
): RawRowRecord {
  return { sheetType, rowIndex, skuKey, data };
}

const classRows: RawRowRecord[] = [
  raw("분류", 0, "", { C: "여성", D: "여성", S: "잡화", T: "잡화류", U: "잡화류" }),
  raw("분류", 1, "", { C: "남성", D: "남성", S: "스포츠", T: "액티브", U: "캐쥬얼" }),
  raw("분류", 2, "", { C: "아동", D: "아동", S: "아동", T: "아동복", U: "아동" }),
];

// 4 SKU: 여성·신상·봄·잡화 / 남성·이월·여름·스포츠 / 아동·신상·가을·아동 / 여성·이월·겨울·잡화
const records: Partial<Record<SheetType, RawRowRecord[]>> = {
  분류: classRows,
  물류비예측: [],
  매출상세: [
    raw("매출상세", 0, "A", { H: 100, I: 50, J: 1, O: "여성", R: "잡화", T: "봄", U: "신상" }),
    raw("매출상세", 1, "B", { H: 200, I: 80, J: 2, O: "남성", R: "스포츠", T: "여름", U: "이월" }),
    raw("매출상세", 2, "C", { H: 300, I: 90, J: 3, O: "아동", R: "아동", T: "가을", U: "신상" }),
    raw("매출상세", 3, "D", { H: 400, I: 99, J: 4, O: "여성", R: "잡화", T: "겨울", U: "이월" }),
  ],
  물류재고: [
    raw("물류재고", 0, "A", { H: 10, I: 1000, X: 1, Y: 100, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
    raw("물류재고", 1, "B", { H: 20, I: 2000, X: 2, Y: 200, Q: "남성", T: "스포츠", V: "여름", W: "이월" }),
    raw("물류재고", 2, "C", { H: 30, I: 3000, X: 3, Y: 300, Q: "아동", T: "아동", V: "가을", W: "신상" }),
    raw("물류재고", 3, "D", { H: 40, I: 4000, X: 4, Y: 400, Q: "여성", T: "잡화", V: "겨울", W: "이월" }),
  ],
  점재고: [
    raw("점재고", 0, "A", { H: 5, I: 500, X: 1, Y: 50, Q: "여성", T: "잡화", V: "봄", W: "신상" }),
    raw("점재고", 1, "D", { H: 8, I: 800, X: 1, Y: 80, Q: "여성", T: "잡화", V: "겨울", W: "이월" }),
  ],
};

const kanban = buildKanban({ records });

describe("buildDrilldownTree — 5단계 중첩", () => {
  it("루트=전체, 자식=성별, 손자=신상이월…아이템 리프", () => {
    const tree = buildDrilldownTree(kanban);
    expect(tree.level).toBe("L0_TOTAL");
    expect(tree.label).toBe("전체 (OPR)");
    // 성별 L1: 여성·남성·아동 (값 있는 것만)
    const genders = tree.children.map((c) => c.label).sort();
    expect(genders).toEqual(["남성", "아동", "여성"]);

    const woman = tree.children.find((c) => c.label === "여성")!;
    expect(woman.level).toBe("L1_GENDER");
    // 여성 → 신상/이월
    const ncs = woman.children.map((c) => c.label).sort();
    expect(ncs).toEqual(["신상", "이월"]);
    // 신상 → 봄 → 잡화류(리프)
    const sin = woman.children.find((c) => c.label === "신상")!;
    const spring = sin.children.find((c) => c.label === "봄")!;
    expect(spring.level).toBe("L4_SEASON");
    const leaf = spring.children.find((c) => c.label === "잡화류")!;
    expect(leaf.level).toBe("L5_ITEM");
    expect(leaf.isLeaf).toBe(true);
    expect(leaf.children.length).toBe(0);
  });

  it("루트 매출 = 전 리프 매출 SUM (가산 무결성)", () => {
    const tree = buildDrilldownTree(kanban);
    const leaves = flattenTree(tree)
      .map((x) => x.node)
      .filter((n) => n.isLeaf);
    const leafSum = leaves.reduce((s, n) => s + n.metrics.sales, 0);
    expect(tree.metrics.sales).toBeCloseTo(leafSum, 6);
  });

  it("노드값 = 검증된 rollup 과 동일 (엑셀 동형 유지)", () => {
    const tree = buildDrilldownTree(kanban);
    const woman = tree.children.find((c) => c.label === "여성")!;
    const ref = rollup(
      kanban.filter((k) => k.gender && k.newcarry && k.season && k.item),
      { gender: "여성", newcarry: "", season: "", item: "" },
      "L1_GENDER",
      (k) => k.gender === "여성",
    );
    expect(woman.metrics.sales).toBeCloseTo(ref.sales, 9);
    expect(woman.metrics.ctrAmt).toBeCloseTo(ref.ctrAmt, 9);
    expect(woman.metrics.invAmtTotal).toBeCloseTo(ref.invAmtTotal, 9);
  });
});

describe("필터 — 진입점 점프", () => {
  it("성별=여성 → 루트가 여성, 자식=신상이월부터", () => {
    const tree = buildDrilldownTree(kanban, { gender: "여성" });
    expect(tree.label).toBe("여성");
    // 자식 = 신상/이월(성별 차원 생략)
    const labels = tree.children.map((c) => c.label).sort();
    expect(labels).toEqual(["신상", "이월"]);
    // 루트 매출 = 여성 매출만
    const womanSales = kanban
      .filter((k) => k.gender === "여성")
      .reduce((s, k) => s + k.j_estSales, 0);
    expect(tree.metrics.sales).toBeCloseTo(womanSales, 6);
  });

  it("성별=여성 & 시즌=봄 → 신상이월 아래 바로 아이템 리프", () => {
    const tree = buildDrilldownTree(kanban, { gender: "여성", season: "봄" });
    const sin = tree.children.find((c) => c.label === "신상")!;
    // 시즌 고정 → 신상 아래 바로 아이템(L5)
    expect(sin.children.every((c) => c.isLeaf)).toBe(true);
    const leaf = sin.children.find((c) => c.label === "잡화류");
    expect(leaf).toBeTruthy();
  });
});

describe("skuDetailsFor — 리프 SKU 상세", () => {
  it("4키 노드의 SKU 행을 매출 내림차순 반환", () => {
    const details = skuDetailsFor(kanban, {
      gender: "여성",
      newcarry: "신상",
      season: "봄",
      item: "잡화류",
    });
    expect(details.length).toBe(1);
    expect(details[0]!.skuKey).toBe("A");
    expect(details[0]!.sales).toBe(100);
  });

  it("성별=여성 전체 SKU(잡화류 2건) 매출 내림차순", () => {
    const details = skuDetailsFor(kanban, { gender: "여성", item: "잡화류" });
    expect(details.map((d) => d.skuKey)).toEqual(["D", "A"]); // 400 > 100
  });
});
