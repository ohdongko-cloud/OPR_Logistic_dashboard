/**
 * 매장 데이터 조회 단일 진입점 — DB(CURRENT FactStore) 우선, 없으면 라이브파일 폴백.
 *
 * 설계(아이템 kanban-source 와 동형):
 *   ① Neon 구성 + CURRENT STORE 스냅샷 → DB 복원(factRowsToStore).
 *   ② 그 외 → 라이브파일(매장 당월 xlsx) 파싱(ingestStoreFile) — 캐시(mtime 무효화).
 *
 * 두 경로 모두 동일한 { kanban, curation, errors } → buildStoreDashboard 결과 동일(UI 안전).
 *
 * ⚠️ 실데이터 파일은 레포에 커밋하지 않는다. 서버 런타임에서 OPR_DATA_DIR 절대경로 "읽기만".
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildStoreKanban,
  ingestStoreFile,
  MONTH_STORE_PARAMS,
  type StoreCuration,
  type StoreErrorIndex,
  type StoreKanbanRow,
  type StoreParams,
} from "@/lib/engine-store";
import { getPrisma } from "@/lib/prisma";

import { resolveDataDir } from "./data-dir";
import { loadCurrentStore } from "./persist-store";

export type StorePeriod = "MONTH" | "CUMULATIVE";
export type StoreSource = "db" | "livefile";

/** period → 매장 실파일명. 매장은 당월만 동봉(누적 미존재 — graceful). */
const STORE_FILE_NAMES: Partial<Record<StorePeriod, string>> = {
  MONTH: "#.유통물류(OPR)_모니터링(매장)_당월(1).xlsx",
  // CUMULATIVE: 미동봉(매장 누적본 없음) — 호출부가 503/안내.
};

const STORE_PARAMS: Record<StorePeriod, StoreParams> = {
  MONTH: MONTH_STORE_PARAMS,
  CUMULATIVE: MONTH_STORE_PARAMS, // 누적 파일 생기면 영업일수만 교체.
};

export class StoreDataError extends Error {
  constructor(
    public code: "missing_file" | "ingest_failed" | "no_period",
    message: string,
  ) {
    super(message);
    this.name = "StoreDataError";
  }
}

export interface ResolvedStore {
  kanban: StoreKanbanRow[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
  params: StoreParams;
  source: StoreSource;
  snapshotId?: string;
}

function dataDir(): string {
  // OPR_DATA_DIR 우선 · dev 폴백 · prod 미설정 throw(신뢰경계 — data-dir.ts).
  return resolveDataDir();
}

function storeFilePath(period: StorePeriod): string | null {
  const name = STORE_FILE_NAMES[period];
  return name ? path.join(dataDir(), name) : null;
}

interface CacheEntry {
  kanban: StoreKanbanRow[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
  mtimeMs: number;
}
const cache = new Map<StorePeriod, CacheEntry>();

/** 라이브파일 파싱(캐시 우선, mtime 무효화). */
function getStoreFromFile(period: StorePeriod): ResolvedStore {
  const params = STORE_PARAMS[period];
  const filePath = storeFilePath(period);
  if (!filePath) {
    throw new StoreDataError(
      "no_period",
      `매장 ${period} 데이터는 동봉되지 않았습니다(당월만 제공).`,
    );
  }
  if (!existsSync(filePath)) {
    throw new StoreDataError(
      "missing_file",
      `매장 데이터 파일을 찾을 수 없습니다(${period}). 서버 경로를 확인하세요.`,
    );
  }
  const mtimeMs = statSync(filePath).mtimeMs;
  const cached = cache.get(period);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { kanban: cached.kanban, curation: cached.curation, errors: cached.errors, params, source: "livefile" };
  }
  const buf = readFileSync(filePath);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = ingestStoreFile(bytes);
  if (!ingest.ok) {
    throw new StoreDataError("ingest_failed", ingest.blockedReason ?? "매장 파일 검증 실패.");
  }
  const kanban = buildStoreKanban({ raw: ingest.raw, params, roster: ingest.roster });
  cache.set(period, { kanban, curation: ingest.curation, errors: ingest.errors, mtimeMs });
  return { kanban, curation: ingest.curation, errors: ingest.errors, params, source: "livefile" };
}

/** 캐시 비우기(테스트·핫리로드). */
export function clearStoreCache(): void {
  cache.clear();
}

/**
 * period 의 매장 데이터를 DB 우선으로 해결.
 * DB 조회 실패는 라이브파일로 graceful 폴백(읽기 가용성 우선).
 */
export async function resolveStore(period: StorePeriod): Promise<ResolvedStore> {
  const params = STORE_PARAMS[period];
  const prisma = getPrisma();
  if (prisma) {
    try {
      const current = await loadCurrentStore(prisma, period, params);
      if (current) {
        return {
          kanban: current.kanban,
          curation: current.curation,
          errors: current.errors,
          params,
          source: "db",
          snapshotId: current.snapshotId,
        };
      }
    } catch (e) {
      console.error("[store-source] DB load failed, fallback to livefile", e);
    }
  }
  return getStoreFromFile(period);
}
