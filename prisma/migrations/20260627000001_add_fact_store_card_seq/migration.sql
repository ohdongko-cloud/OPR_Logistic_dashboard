-- 매장② FactStore 큐레이션 카드 순번(cardSeq) 추가 — PPT 슬2 점포-행 순서 결정성.
-- 근거: 하드닝 리뷰 #2(HIGH) — findMany orderBy 부재로 DB 복원 시 curation.codes 순서가
--        비결정적으로 깨져 PPT 슬2 점포 셀에 엉뚱한 점포 수치가 들어감.
-- 해결: 카드 순번을 cardSeq 로 박제(저장), 복원 시 cardSeq ASC 로 codes 재구성(라이브파일과 동순).
-- 안전: 멱등(IF NOT EXISTS) · 하위호환(신규 컬럼 NOT NULL DEFAULT 0 → 기존 행 백필 0) · 파괴적 없음.
-- 롤백: ALTER TABLE "fact_store" DROP COLUMN IF EXISTS "cardSeq" (시계열 보존상 운영 DROP 은 별도 확인 후).

ALTER TABLE "fact_store" ADD COLUMN IF NOT EXISTS "cardSeq" INTEGER NOT NULL DEFAULT 0;
