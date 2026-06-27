/**
 * 업로드 롤백(SUPERSEDED → CURRENT 복원) — 단일 트랜잭션 상태 전환.
 *
 * 근거: 백로그 C11 · persist*.ts PUBLISH 트랜잭션과 동형(역방향).
 *
 * 정책:
 *   - 대상 스냅샷은 **SUPERSEDED** 여야 한다(이미 CURRENT/처리중/실패·미존재 → 거부).
 *   - 단일 $transaction 안에서 같은 (fileType, periodType) 의 **모든** 현 CURRENT 를
 *     SUPERSEDED 로 강등 → 그 다음 대상 → CURRENT 로 승격.
 *     ⚠️ 부분 유니크 인덱스 "snapshots_current_unique"(fileType, periodType) WHERE status='CURRENT'
 *        위반을 피하려면 **강등이 승격보다 먼저**여야 한다(순서 보장).
 *   - 삭제 없음 — status 전환만(헌장 이력보존). IngestLog 에 RESTORE 기록
 *     (IngestPhase 에 RESTORE enum 이 없으므로 PUBLISH + detail.action="RESTORE" 로 박제 —
 *      스키마/엔진 미변경. 감사 추적은 detail 로 질의 가능).
 *
 * 멱등·안전: 트랜잭션 실패 시 전부 롤백(부분 전환 없음). ADMIN/권한 게이트는 라우트 책임.
 */

import { PrismaClient } from "@prisma/client";

/** 복원 실패(라우트가 status 로 매핑). */
export class RestoreError extends Error {
  constructor(
    public status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export interface RestoreResult {
  /** CURRENT 로 승격된 대상 id. */
  restoredId: string;
  /** 강등(SUPERSEDED)된 이전 CURRENT id 목록(0건일 수 있음). */
  demotedIds: string[];
  fileType: "ITEM" | "STORE" | "PRODUCT";
  periodType: "MONTH" | "CUMULATIVE";
}

/**
 * SUPERSEDED 스냅샷을 CURRENT 로 복원.
 * @param prisma Prisma 클라이언트(라우트에서 null 체크 후 주입).
 * @param targetId 복원할 스냅샷 id.
 * @param actorId  복원 수행자(IngestLog 감사용, 선택).
 * @throws RestoreError 대상이 없거나 SUPERSEDED 가 아닐 때.
 */
export async function restoreSnapshot(
  prisma: PrismaClient,
  targetId: string,
  actorId?: string,
): Promise<RestoreResult> {
  // 사전 검증(트랜잭션 밖 — 빠른 거부). 트랜잭션 내에서도 재확인하지 않는 이유:
  //  대상 행은 본 복원 외엔 동시 갱신이 드물고, 강등/승격은 status 조건으로 멱등.
  const target = await prisma.snapshot.findUnique({
    where: { id: targetId },
    select: { id: true, fileType: true, periodType: true, status: true },
  });
  if (!target) {
    throw new RestoreError(404, "대상 스냅샷이 없습니다.");
  }
  if (target.status !== "SUPERSEDED") {
    throw new RestoreError(
      409,
      target.status === "CURRENT"
        ? "이미 현재(CURRENT) 스냅샷입니다."
        : `복원 대상은 SUPERSEDED 여야 합니다(현재: ${target.status}).`,
    );
  }

  const fileType = target.fileType as RestoreResult["fileType"];
  const periodType = target.periodType as RestoreResult["periodType"];

  const demotedIds = await prisma.$transaction(async (tx) => {
    // ① 같은 격리키(fileType, periodType) 의 현 CURRENT 전부 강등(대상 제외).
    const prevCurrents = await tx.snapshot.findMany({
      where: {
        fileType,
        periodType,
        status: "CURRENT",
        id: { not: targetId },
      },
      select: { id: true },
    });
    if (prevCurrents.length > 0) {
      // ⚠️ 강등을 먼저 — 부분 유니크 인덱스(status=CURRENT) 위반 차단.
      await tx.snapshot.updateMany({
        where: { id: { in: prevCurrents.map((p) => p.id) } },
        data: { status: "SUPERSEDED" },
      });
    }
    // ② 대상 승격(강등 이후라야 CURRENT 유일성 보장).
    await tx.snapshot.update({
      where: { id: targetId },
      data: { status: "CURRENT" },
    });
    return prevCurrents.map((p) => p.id);
  });

  // RESTORE 감사 기록(PUBLISH + detail.action=RESTORE — enum 미변경).
  await prisma.ingestLog
    .create({
      data: {
        snapshotId: targetId,
        phase: "PUBLISH",
        result: "OK",
        detail: {
          action: "RESTORE",
          demotedIds,
          fileType,
          periodType,
          ...(actorId ? { actorId } : {}),
        },
      },
    })
    .catch(() => {
      // 감사 로그 실패는 복원 자체를 무효화하지 않음(상태 전환은 이미 커밋됨).
    });

  return { restoredId: targetId, demotedIds, fileType, periodType };
}
