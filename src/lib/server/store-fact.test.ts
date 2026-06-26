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

  it("칸반 → FactStore insert(31점 + 4 집계) → 복원 → 동일 대시보드 flatRows", () => {
    const inserts = storeKanbanToFactRows(kanban, "snap1", ingest!.curation, ingest!.errors);
    // 31 점포 + 집계 마스터(전체/직영/중관/기타 — 마스터/(−)재고 있는 만큼).
    expect(inserts.filter((r) => !["전체", "직영", "중간관리", "기타"].includes(r.storeCode)).length).toBe(31);

    // insert(number) → DB 행(unknown Decimal 시뮬) 으로 그대로 사용 가능(toNum 통과).
    const dbRows = inserts as unknown as FactStoreRow[];
    const restored = factRowsToStore(dbRows, MONTH_STORE_PARAMS);

    // 직접 경로 대시보드.
    const direct = buildStoreDashboard(kanban, {
      params: MONTH_STORE_PARAMS,
      curation: ingest!.curation,
      errors: ingest!.errors,
    });
    // 복원 경로 대시보드.
    const round = buildStoreDashboard(restored.kanban, {
      params: MONTH_STORE_PARAMS,
      curation: restored.curation,
      errors: restored.errors,
    });

    expect(round.flatRows.length).toBe(direct.flatRows.length);

    // 모든 행·필드 동일(1e-6).
    const byCode = new Map(round.flatRows.map((r) => [r.code, r]));
    let mismatches = 0;
    const fields: (keyof (typeof direct.flatRows)[number])[] = [
      "saleMult", "dotsDays", "seasonPct", "stockRatio",
      "inQtyFix", "saleQtyFix", "invQtyFix", "inQtyAll", "saleQtyAll", "invQtyAll",
      "negQty", "negAmt",
    ];
    for (const d of direct.flatRows) {
      const r = byCode.get(d.code);
      expect(r, `복원행 ${d.code} 존재`).toBeDefined();
      for (const f of fields) {
        const dv = d[f] as number | null;
        const rv = r![f] as number | null;
        const eq =
          (dv === null && rv === null) ||
          (dv !== null && rv !== null && Math.abs(dv - rv) <= 1e-6 * (1 + Math.abs(dv)));
        if (!eq) {
          mismatches++;
          if (mismatches <= 10) console.log(`불일치 ${d.code}.${String(f)}: direct=${dv} round=${rv}`);
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});
