/**
 * 칸반 조회 단일 진입점 — DB(CURRENT 스냅샷) 우선, 없으면 라이브파일 폴백.
 *
 * 설계: /api/agg·/api/agg/sku 는 이 함수만 호출한다(응답 계약 불변).
 *   ① Neon 구성 + CURRENT FactKanban 존재 → DB 에서 복원(factRowsToKanban).
 *   ② 그 외(DB 미구성 / CURRENT 없음) → 기존 engine-cache(라이브파일 파싱).
 *
 * 두 경로 모두 동일한 KanbanRow[] 를 내므로(fact-to-kanban 라운드트립 검증),
 *  buildDrilldownTree·skuDetailsFor 결과가 완전히 동일하다 — UI 의존 안전.
 */

import { type KanbanRow, type PeriodType } from "@/lib/engine";
import { getPrisma } from "@/lib/prisma";

import { EngineDataError, getKanban } from "./engine-cache";
import { loadCurrentKanban } from "./persist";

export type KanbanSource = "db" | "livefile";

export interface ResolvedKanban {
  kanban: KanbanRow[];
  source: KanbanSource;
  /** DB 경로일 때 스냅샷 id(증거·진단용). */
  snapshotId?: string;
}

/**
 * period 의 칸반을 DB 우선으로 해결.
 * DB 조회 실패(연결 등)는 라이브파일로 graceful 폴백(읽기 가용성 우선).
 * 라이브파일도 없으면 EngineDataError(missing_file) 전파.
 */
export async function resolveKanban(period: PeriodType): Promise<ResolvedKanban> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const current = await loadCurrentKanban(prisma, period);
      if (current) {
        return { kanban: current.kanban, source: "db", snapshotId: current.snapshotId };
      }
    } catch (e) {
      // DB 일시 장애 → 로그만, 라이브파일로 폴백(조회 가용성).
      console.error("[kanban-source] DB load failed, fallback to livefile", e);
    }
  }
  // 폴백: 라이브파일(EngineDataError 그대로 전파 — 호출부가 상태코드 매핑).
  const kanban = getKanban(period);
  return { kanban, source: "livefile" };
}

export { EngineDataError };
