/**
 * store-fact 라운드트립 — 칸반 → FactStore → 복원 → 동일 대시보드(실파일 ground truth).
 *
 * ⚠️ 실데이터 파일 부재 시 skip. DB 미적재 상태에서도 매핑 라운드트립의 무손실을 검증
 *    (영속화 경로가 라이브파일 경로와 동일 출력임을 보장 — 응답 계약 불변).
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildStoreDashboard,
  buildStoreKanban,
  ingestStoreFile,
  MONTH_STORE_PARAMS,
} from "@/lib/engine-store";

import {
  factRowsToStore,
  storeKanbanToFactRows,
  type FactStoreRow,
} from "./store-fact";

const REAL_FILE =
  "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일/#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx";
const HAS_FILE = existsSync(REAL_FILE);

describe.skipIf(!HAS_FILE)("store-fact 라운드트립(매핑 무손실)", () => {
  const buf = HAS_FILE ? readFileSync(REAL_FILE) : Buffer.alloc(0);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = HAS_FILE ? ingestStoreFile(bytes) : null;
  const kanban = HAS_FILE
    ? buildStoreKanban({ raw: ingest!.raw, params: MONTH_STORE_PARAMS, roster: ingest!.roster })
    : [];

  const fields: (keyof StoreFlatRow)[] = [
    "saleMult", "dotsDays", "seasonPct", "stockRatio",
    "inQtyFix", "saleQtyFix", "invQtyFix", "inQtyAll", "saleQtyAll", "invQtyAll",
    "negQty", "negAmt",
  ];

  /** flatRows 를 인덱스 동일성으로 비교(byCode 가 아닌 순서 동일성 — 점포 행 순서 어긋남 검출). */
  function expectFlatRowsEqualByIndex(
    direct: StoreFlatRow[],
    round: StoreFlatRow[],
    ctx: string,
  ): void {
    expect(round.length, `${ctx} flatRows 길이`).toBe(direct.length);
    let mismatches = 0;
    for (let i = 0; i < direct.length; i++) {
      const d = direct[i];
      const r = round[i];
      // 위치(인덱스) 기준 동일 코드여야 한다 — 순서 손실이면 여기서 깨진다.
      expect(r.code, `${ctx} idx${i} code`).toBe(d.code);
      expect(r.level, `${ctx} idx${i} level`).toBe(d.level);
      for (const f of fields) {
        const dv = d[f] as number | null;
        const rv = r[f] as number | null;
        const eq =
          (dv === null && rv === null) ||
          (dv !== null && rv !== null && Math.abs(dv - rv) <= 1e-6 * (1 + Math.abs(dv)));
        if (!eq) {
          mismatches++;
          if (mismatches <= 10) console.log(`불일치 ${ctx} ${d.code}.${String(f)}: direct=${dv} round=${rv}`);
        }
      }
    }
    expect(mismatches, `${ctx} 필드 불일치`).toBe(0);
  }

  it("칸반 → FactStore insert(31점 + 4 집계) → 복원 → 동일 대시보드 flatRows(인덱스 동일성)", () => {
    const inserts = storeKanbanToFactRows(kanban, "snap1", ingest!.curation, ingest!.errors);
    // 31 점포 + 집계 마스터(전체/직영/중관/기타 — 마스터/(−)재고 있는 만큼).
    expect(inserts.filter((r) => !["전체", "직영", "중간관리", "기타"].includes(r.storeCode)).length).toBe(31);
    // 카드 행(isCard) 의 cardSeq 는 curation.codes 인덱스와 일치해야 한다.
    for (const r of inserts) {
      if (r.isCard) {
        expect(ingest!.curation.codes[r.cardSeq]).toBe(r.storeCode);
      }
    }

    // insert(number) → DB 행(unknown Decimal 시뮬) 으로 그대로 사용 가능(toNum 통과).
    const dbRows = inserts as unknown as FactStoreRow[];
    const restored = factRowsToStore(dbRows, MONTH_STORE_PARAMS);

    const direct = buildStoreDashboard(kanban, {
      params: MONTH_STORE_PARAMS,
      curation: ingest!.curation,
      errors: ingest!.errors,
    });
    const round = buildStoreDashboard(restored.kanban, {
      params: MONTH_STORE_PARAMS,
      curation: restored.curation,
      errors: restored.errors,
    });

    expectFlatRowsEqualByIndex(direct.flatRows, round.flatRows, "정상순서");
  });

  it("DB findMany 비결정(셔플) 입력에도 점포-행 순서가 livefile 과 동일(cardSeq 복원)", () => {
    const inserts = storeKanbanToFactRows(kanban, "snap1", ingest!.curation, ingest!.errors);
    const dbRows = inserts as unknown as FactStoreRow[];

    // Postgres findMany 의 orderBy 부재(순서 미보장)를 모사 — 고정 시드 셔플.
    const shuffled = deterministicShuffle(dbRows, 0x9e3779b1);
    // 셔플로 인해 원래 배열 순서가 실제로 바뀌었는지 확인(테스트가 무의미하지 않도록).
    expect(shuffled.map((r) => r.storeCode)).not.toEqual(dbRows.map((r) => r.storeCode));

    const restored = factRowsToStore(shuffled, MONTH_STORE_PARAMS);
    const direct = buildStoreDashboard(kanban, {
      params: MONTH_STORE_PARAMS,
      curation: ingest!.curation,
      errors: ingest!.errors,
    });
    const round = buildStoreDashboard(restored.kanban, {
      params: MONTH_STORE_PARAMS,
      curation: restored.curation,
      errors: restored.errors,
    });

    // 셔플 입력이어도 복원 codes 순서(=L2_STORE 등장 순서)가 livefile 과 비트단위 일치.
    expect(restored.curation.codes).toEqual(ingest!.curation.codes);
    expectFlatRowsEqualByIndex(direct.flatRows, round.flatRows, "셔플복원");
  });
});

type StoreFlatRow = ReturnType<typeof buildStoreDashboard>["flatRows"][number];

/** 결정적(시드) 셔플 — 테스트 재현성 보장. Mulberry32 PRNG + Fisher-Yates. */
function deterministicShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0;
  const rand = (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
