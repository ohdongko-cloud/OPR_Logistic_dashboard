/**
 * 서버측 엔진 캐시 — 실파일 읽기 → ingest → runEngine → 메모리 캐시(period별).
 *
 * 근거: PM 지시 "Neon 아직 없으니 실파일을 서버에서 파싱→runEngine→FactRow 트리".
 *       대시보드_설계_v1.md §4-1(당월/누적 = 앵커만 상이) · spec 부록C(앵커).
 *
 * ⚠️ 실데이터 파일은 레포에 커밋하지 않는다(보안). 서버 런타임에서 절대경로로 "읽기만".
 *    경로는 env.OPR_DATA_DIR 로 재정의 가능(미설정 시 문서상 기본경로).
 *    파일이 없으면 명시적 에러(클라엔 안전 메시지) — 시크릿·실데이터 누출 없음.
 *
 * 캐시: period_type(MONTH|CUMULATIVE) → { kanban, mtimeMs }. 파일 mtime 변경 시 무효화.
 *       (백그라운드 액세스 메모리 §: liveness 는 mtime 으로 검증.)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ingestFiles } from "@/lib/ingest";
import {
  buildKanban,
  type KanbanRow,
  type PeriodAnchors,
  type PeriodType,
} from "@/lib/engine";

/** 문서상 기본 데이터 폴더(서버 로컬 — 커밋 대상 아님). */
const DEFAULT_DATA_DIR = "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";

/** period → 실파일명. */
const FILE_NAMES: Record<PeriodType, string> = {
  MONTH: "#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx",
  CUMULATIVE: "#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx",
};

/** period → 앵커(spec 부록C). 당월=(21,30,1.22) · 누적=(172,181,1.02). */
const ANCHORS: Record<PeriodType, PeriodAnchors> = {
  MONTH: { salesDays: 21, monthDays: 30, factor: 1.22 },
  CUMULATIVE: { salesDays: 172, monthDays: 181, factor: 1.02 },
};

function dataDir(): string {
  return process.env.OPR_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function periodFilePath(period: PeriodType): string {
  // 런타임 로컬 경로(실데이터). 서버 전용 — 절대 번들·커밋되지 않는다.
  // (Turbopack NFT 트레이서가 이 fs 읽기를 경고하나 빌드는 성공 — 의도된 런타임 read.)
  return path.join(dataDir(), FILE_NAMES[period]);
}

interface CacheEntry {
  kanban: KanbanRow[];
  mtimeMs: number;
}

const cache = new Map<PeriodType, CacheEntry>();

export class EngineDataError extends Error {
  constructor(
    public code: "missing_file" | "ingest_failed",
    message: string,
  ) {
    super(message);
    this.name = "EngineDataError";
  }
}

/**
 * period 의 칸반(엔진 Stage1 결과)을 캐시 우선 반환.
 * 파일 mtime 변경 시 재파싱. 파일 부재·검증실패는 명시적 에러.
 */
export function getKanban(period: PeriodType): KanbanRow[] {
  const filePath = periodFilePath(period);
  if (!existsSync(filePath)) {
    throw new EngineDataError(
      "missing_file",
      `데이터 파일을 찾을 수 없습니다(${period}). 서버 경로를 확인하세요.`,
    );
  }
  const mtimeMs = statSync(filePath).mtimeMs;
  const cached = cache.get(period);
  if (cached && cached.mtimeMs === mtimeMs) return cached.kanban;

  const buf = readFileSync(filePath);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = ingestFiles([
    { name: FILE_NAMES[period], size: buf.byteLength, bytes },
  ]);
  if (!ingest.ok) {
    throw new EngineDataError(
      "ingest_failed",
      ingest.blockedReason ?? "파일 검증에 실패했습니다.",
    );
  }
  const kanban = buildKanban({ records: ingest.records, anchors: ANCHORS[period] });
  cache.set(period, { kanban, mtimeMs });
  return kanban;
}

/** 캐시 비우기(테스트·핫리로드용). */
export function clearEngineCache(): void {
  cache.clear();
}
