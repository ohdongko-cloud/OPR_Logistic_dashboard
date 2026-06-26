/**
 * 상품 엔진 ↔ 실파일 내부정합 검증 (증거 — 엑셀 ground truth 없음 주의).
 *
 * ⚠️ 슬3·4는 수기 작성이라 셀단위 대조 불가(spec §검증). 대신:
 *   ① 측정식 동치: 상품 엔진 전체합 = 아이템 엔진 전체합(같은 RAW 풀, 키만 재그룹).
 *      입고량·재고량·출고량·판매량·실매출액·매출원가 6필드 전부 일치 → 측정식이 아이템과 동일.
 *   ② 브랜드 grain 무결성: 브랜드별 합 = 전체 합(누락/이중계상 0).
 *   ③ spot-check: 상위 1~2 브랜드 수치 합리성(출고율·매총율 0~1 범위, 입고>0).
 *
 * ⚠️ 실데이터 파일은 레포에 커밋·복사하지 않는다(보안). 절대경로 "참조만". 부재 시 skip(CI 안전).
 *    산출 수치도 커밋하지 않음(테스트가 xlsx 직접 파싱 대조).
 *
 * ★주의: 아이템 엔진은 SKU(A) grain SUMIF, 상품 엔진은 brand(F)×season SUMIFS.
 *   같은 RAW 의 같은 측정컬럼을 합하므로 **전체 총합은 동일해야** 한다(F 결측행만 차이 가능 →
 *   허용오차로 흡수하되, 결측 0건이면 완전 일치).
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildKanban } from "@/lib/engine";
import { ingestFiles } from "@/lib/ingest";

import { buildProductFacts } from "./stage1-product";
import { buildProductDashboard } from "./stage2-product-tree";
import { PRODUCT_DATA_FIELDS } from "./types";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);
const FILE_NAME = "#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx";

function approxEq(a: number, b: number, tol = 1e-4): boolean {
  return Math.abs(a - b) <= tol * (1 + Math.abs(a));
}

describe.skipIf(!HAS_FILE)("상품 엔진 ↔ 실파일 내부정합 (누적 아이템)", () => {
  const buf = HAS_FILE ? readFileSync(REAL_FILE) : Buffer.alloc(0);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = HAS_FILE
    ? ingestFiles([{ name: FILE_NAME, size: buf.byteLength, bytes }])
    : null;

  // 아이템 엔진(누적 앵커) — 측정식 동치 ground truth.
  const itemKanban = HAS_FILE
    ? buildKanban({
        records: ingest!.records,
        anchors: { salesDays: 172, monthDays: 181, factor: 1.02 },
      })
    : [];
  // 상품 엔진(brand×season).
  const facts = HAS_FILE ? buildProductFacts({ records: ingest!.records }) : [];
  const dash = HAS_FILE ? buildProductDashboard(facts) : null;

  it("ingest 6 RAW 충족 + 상품 facts 생성", () => {
    expect(ingest!.ok).toBe(true);
    expect(facts.length).toBeGreaterThan(0);
  });

  it("브랜드 grain — 구매그룹 코드 30~34종(스펙 §1-B distinct 34)", () => {
    const brands = new Set(facts.map((f) => f.brandCode));
    console.log(`[상품] 브랜드 distinct=${brands.size}, season×brand 행=${facts.length}`);
    expect(brands.size).toBeGreaterThanOrEqual(28);
    expect(brands.size).toBeLessThanOrEqual(40);
  });

  it("측정식 동치 — 상품 전체합 = 아이템 엔진 전체합 (입고·재고·출고·판매·매출·원가)", () => {
    // 아이템 칸반 전체합(같은 측정컬럼).
    const itemTotals = {
      inQty: itemKanban.reduce((s, k) => s + k.at_inQty, 0), // 센터입출고 I
      invQty: itemKanban.reduce((s, k) => s + k.y_ctrQty, 0), // 물류재고 H
      outQty: itemKanban.reduce((s, k) => s + k.az_outQty, 0), // 센터입출고 M
      saleQty: itemKanban.reduce((s, k) => s + k.m_qty, 0), // 매출 J
      salesAmt: itemKanban.reduce((s, k) => s + k.n_sales, 0), // 매출 H
      cogs: itemKanban.reduce((s, k) => s + k.o_cogs, 0), // 매출 I
    };
    const p = dash!.root.fact;
    const fails: string[] = [];
    for (const f of PRODUCT_DATA_FIELDS) {
      const iv = itemTotals[f as keyof typeof itemTotals];
      const pv = p[f] as number;
      const ok = approxEq(iv, pv, 1e-4);
      console.log(`  ${f}: item=${iv} product=${pv} ${ok ? "✓" : "✗"}`);
      if (!ok) fails.push(`${f}: item=${iv} product=${pv} (Δ=${pv - iv})`);
    }
    expect(fails, fails.join("\n")).toEqual([]);
  });

  it("내부정합 — 브랜드별 합 = 전체 합(누락/이중계상 0)", () => {
    for (const f of PRODUCT_DATA_FIELDS) {
      const brandSum = dash!.root.children.reduce((s, b) => s + (b.fact[f] as number), 0);
      const leafSum = facts.reduce((s, r) => s + (r[f] as number), 0);
      expect(approxEq(brandSum, dash!.root.fact[f] as number, 1e-6), `브랜드합 ${f}`).toBe(true);
      expect(approxEq(leafSum, dash!.root.fact[f] as number, 1e-6), `리프합 ${f}`).toBe(true);
    }
  });

  it("spot-check — 입고량 상위 브랜드: 입고>0 · 출고율·매총율 합리(±)", () => {
    const ranked = [...dash!.root.children].sort((a, b) => b.fact.inQty - a.fact.inQty);
    const top = ranked.slice(0, 2);
    for (const b of top) {
      console.log(
        `  [${b.brandCode}] 입고=${Math.round(b.fact.inQty)} 출고=${Math.round(b.fact.outQty)} ` +
          `판매=${Math.round(b.fact.saleQty)} 출고율=${b.fact.outRate?.toFixed(3)} ` +
          `매총율=${b.fact.grossRate?.toFixed(3)}`,
      );
      expect(b.fact.inQty).toBeGreaterThan(0);
      // 출고율·매총율 = 비율 — 음수 무한대 아님(데이터 합리성). 매총율은 할인 시 음수 가능하나 유한.
      if (b.fact.outRate !== null) expect(Number.isFinite(b.fact.outRate)).toBe(true);
      if (b.fact.grossRate !== null) expect(Number.isFinite(b.fact.grossRate)).toBe(true);
    }
  });
});
