-- 스냅샷 CURRENT 단일성 — (fileType, periodType) 당 CURRENT 1건만 허용(부분 유니크 인덱스).
-- 근거: 하드닝 리뷰 #4(MED) — 같은 논리적 기간 재업로드가 다중 CURRENT 를 만들어 멱등/단일진실원 위반.
--        애플리케이션 supersede(persist*.ts)가 모든 CURRENT 를 강등하도록 교정됐고, 이 인덱스는
--        DB 레벨 마지막 방어선(경합·잔존 stale 로 CURRENT 가 2건이 되는 상황을 원천 차단).
-- 안전: 부분 인덱스(WHERE status='CURRENT') — Prisma 미지원이라 raw SQL. 멱등(IF NOT EXISTS).
--        파괴적 변경 없음(컬럼·데이터 불변). 단, 인덱스 생성은 적용 시점에 이미 다중 CURRENT 가
--        존재하면 실패할 수 있으므로(아래 사전 정리 가드) PM 의 migrate deploy 전 데이터 확인 권장.
-- 롤백: DROP INDEX IF EXISTS "snapshots_current_unique";

-- 사전 정리(멱등): 혹시 이미 다중 CURRENT 가 쌓여 있으면, (fileType, periodType) 그룹별 최신
--   (periodEnd DESC, uploadedAt DESC) 1건만 CURRENT 로 남기고 나머지는 SUPERSEDED 로 강등.
--   (시계열 보존 — 삭제 없이 status 전환만. 인덱스 생성이 기존 데이터로 실패하는 것을 방지.)
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "fileType", "periodType"
      ORDER BY "periodEnd" DESC, "uploadedAt" DESC, "id" DESC
    ) AS rn
  FROM "snapshots"
  WHERE "status" = 'CURRENT'
)
UPDATE "snapshots" s
SET "status" = 'SUPERSEDED'
FROM ranked
WHERE s."id" = ranked."id" AND ranked.rn > 1;

-- 부분 유니크 인덱스: status='CURRENT' 행에 한해 (fileType, periodType) 유일.
CREATE UNIQUE INDEX IF NOT EXISTS "snapshots_current_unique"
  ON "snapshots" ("fileType", "periodType")
  WHERE "status" = 'CURRENT';
