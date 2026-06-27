-- C10 입출반 금액: fact_kanban 에 입고/출고/반품 '금액' 3컬럼 추가.
-- 근거: 슬라이드5(목표대비) 입출고/반품 '금액' 칸 — 칸반 AU/BA/BE(au_inAmt/ba_outAmt/be_retAmt)에
--        이미 존재하나 그동안 FactKanban 집계에 미반영 → DB 경로에서 0 으로 떨어지던 결함.
--        엔진(stage2 kanbanToBase)에 가산 추가 + 본 컬럼으로 SKU grain 박제 → 슬5 금액 칸 파생.
-- 안전: 멱등(ADD COLUMN IF NOT EXISTS) · 하위호환(NOT NULL DEFAULT 0 — 기존 행·구버전 insert 무영향) ·
--        파괴적 변경 없음(기존 19데이터+10파생 컬럼 불변, 신규 가산 3컬럼만 추가).
-- 롤백: 보상 = ALTER TABLE "fact_kanban" DROP COLUMN IF EXISTS "mInAmt"/"mOutAmt"/"mRetAmt"
--        (시계열 보존상 운영 DROP 은 별도 확인 후).

ALTER TABLE "fact_kanban" ADD COLUMN IF NOT EXISTS "mInAmt"  DECIMAL(18,2) NOT NULL DEFAULT 0; -- AU 입고금액
ALTER TABLE "fact_kanban" ADD COLUMN IF NOT EXISTS "mOutAmt" DECIMAL(18,2) NOT NULL DEFAULT 0; -- BA 출고금액
ALTER TABLE "fact_kanban" ADD COLUMN IF NOT EXISTS "mRetAmt" DECIMAL(18,2) NOT NULL DEFAULT 0; -- BE 반품금액
