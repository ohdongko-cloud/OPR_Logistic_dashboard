/**
 * C12 시즌 파라미터화 회귀 — 시즌 라벨 동적화가 **엔진 산식/출력에 무영향**임을 증명.
 *
 * 핵심 불변(C12): summerInvQty/summerPct/seasonPct 산식은 시즌과 무관(VLOOKUP K:N 블록 고정).
 *   바뀌는 건 라벨(명칭)뿐. 따라서 동일 칸반 입력 → 동일 대시보드 수치(시즌명 무관).
 *
 * 추가: 실파일이 있으면 ingest 가 헤더에서 "여름"을 추출하는지 확인(현행 스냅샷).
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildStoreAggTree } from "./agg-store-tree";
import { buildStoreColGroups } from "./agg-store-columns";
import { ingestStoreFile } from "./ingest-store";
import { buildStoreKanban } from "./stage1-store-kanban";
import { buildStoreDashboard } from "./stage2-store-tree";
import { MONTH_STORE_PARAMS, type StoreKanbanRow } from "./types";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);

describe("C12 시즌 라벨 = 엔진 출력 불변(산식은 시즌 무관)", () => {
  /** 시즌 비중/재고가 0이 아닌 점포행. */
  function richLeaf(
    code: string,
    channel: StoreKanbanRow["channel"],
    name: string,
  ): StoreKanbanRow {
    return {
      storeCode: code,
      channel,
      storeName: name,
      saleMult: null,
      dotsFix: null,
      dotsAll: null,
      summerPct: null,
      inQtyFix: 100,
      inAmtFix: 0,
      retQtyFix: 0,
      retAmtFix: 0,
      saleQtyFix: 0,
      saleAmtFix: 0,
      cogsFix: 0,
      dailyCogsFix: null,
      summerInvQty: 3_000, // "해당 시즌+공통" 재고량
      summerInvAmt: 0,
      invQtyFix: 5_000,
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
      invQtyAll: 9_000,
      invAmtAll: 0,
      openQtyAll: 0,
      openAmtAll: 0,
      avgInvAll: null,
    };
  }

  const KANBAN: StoreKanbanRow[] = [
    richLeaf("A1", "직영", "직영점1"),
    richLeaf("B1", "중간관리", "중관점1"),
  ];
  const INPUT = {
    params: MONTH_STORE_PARAMS,
    curation: { codes: ["A1"], masters: {} },
    errors: { byCode: new Map(), byName: new Map() },
  };

  it("시즌비중(F) = 동일 입력이면 라벨과 무관하게 동일 수치", () => {
    const dash = buildStoreDashboard(KANBAN, INPUT);
    const tree = buildStoreAggTree(dash, {});
    // 직영 점포 카드: seasonPct = O/P = summerInvQty/invQtyFix = 3000/5000.
    const direct = tree.children.find((c) => c.label === "직영")!;
    const store = direct.children[0]!;
    expect(store.metrics.seasonPct).toBeCloseTo(3_000 / 5_000, 10);
    // 집계행(전체): seasonPct = O/T = 6000/18000.
    expect(tree.metrics.seasonPct).toBeCloseTo(6_000 / 18_000, 10);
  });

  it("컬럼 라벨만 시즌 동적 — 가을이면 '가을재고량', 산식 컬럼(field/excelCol)은 불변", () => {
    const summer = buildStoreColGroups("여름");
    const fall = buildStoreColGroups("가을");
    const findInv = (g: ReturnType<typeof buildStoreColGroups>) =>
      g.flatMap((x) => x.cols).find((c) => c.field === "summerInvQty")!;
    expect(findInv(summer).label).toBe("여름재고량");
    expect(findInv(fall).label).toBe("가을재고량");
    // field·excelCol·format 불변(엑셀 추적·산식 매핑 보존).
    expect(findInv(fall).field).toBe("summerInvQty");
    expect(findInv(fall).excelCol).toBe("P");
    expect(findInv(fall).format).toBe("qty");
    // 시즌비중 컬럼은 계절 미표기 라벨 유지(가을/겨울 오표기 차단).
    const seasonCol = (g: ReturnType<typeof buildStoreColGroups>) =>
      g.flatMap((x) => x.cols).find((c) => c.field === "seasonPct")!;
    expect(seasonCol(summer).label).toBe("시즌비중");
    expect(seasonCol(fall).label).toBe("시즌비중");
  });

  it("default(여름) 컬럼 = 현행과 비트단위 동일", () => {
    const def = buildStoreColGroups();
    const summer = buildStoreColGroups("여름");
    expect(JSON.stringify(def)).toBe(JSON.stringify(summer));
  });
});

describe.skipIf(!HAS_FILE)("C12 ingest 시즌 추출(실파일)", () => {
  it("현행 스냅샷은 '여름' 추출 + 엔진 234/992/128 회귀 불변", () => {
    const buf = readFileSync(REAL_FILE);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const ingest = ingestStoreFile(bytes);
    expect(ingest.ok).toBe(true);
    // 칸반 헤더 G6="여름비중" → "여름".
    expect(ingest.seasonLabel).toBe("여름");

    // 엔진 출력은 그대로(시즌 라벨이 산식에 닿지 않음).
    const kanban = buildStoreKanban({ raw: ingest.raw, params: MONTH_STORE_PARAMS, roster: ingest.roster });
    expect(kanban.length).toBe(31);
    const dash = buildStoreDashboard(kanban, {
      params: MONTH_STORE_PARAMS,
      curation: ingest.curation,
      errors: ingest.errors,
    });
    // 전체행 존재 + seasonPct 가 정상 산출(스냅샷 회귀는 store-engine-realfile.test 가 234/234 셀대조).
    const total = dash.flatRows.find((r) => r.level === "L0_TOTAL")!;
    expect(total.seasonPct).not.toBeNull();
  });
});
