/**
 * 엔진 TRANSFORM 공용 타입 — 칸반(Stage1) · 4키 팩트(Stage2).
 *
 * 근거: 02_파일분석/엔진_transform_spec.md · 04_시스템_설계/아키텍처_대시보드MVP.md(FactKanban grain).
 *
 * 흐름:
 *   RawRowRecord[] (ingest) ─Stage1→ KanbanRow[] (SKU 1행, 4키+19지표+칸반파생)
 *                          ─Stage2→ FactRow[]   (4키 grain + 19지표 SUM + 10파생 재계산 + ROLLUP)
 */

/** 기간 유형(당월/누적) — 앵커 파라미터 1개로 시트 2벌 불요(spec 부록C). */
export type PeriodType = "MONTH" | "CUMULATIVE";

/**
 * 앵커 파라미터(칸반 D1·E1·F1) — J(추정매출)·P(소진액) 산식의 분모/배율.
 * 당월=(21,30,1.22). 누적은 값만 상이(시트참조 동형).
 */
export interface PeriodAnchors {
  /** D1 판매일수 */
  salesDays: number;
  /** E1 월 일수 */
  monthDays: number;
  /** F1 보정계수 */
  factor: number;
}

/** 당월 기본 앵커(실파일 칸반 D1=21·E1=30·F1=1.22 실측). */
export const MONTH_ANCHORS: PeriodAnchors = {
  salesDays: 21,
  monthDays: 30,
  factor: 1.22,
};

/** 누적 기본 앵커(실파일 칸반 E1=172·F1=181·G1=1.02 실측 — 시트참조 동형, 셀 시프트). */
export const CUMULATIVE_ANCHORS: PeriodAnchors = {
  salesDays: 172,
  monthDays: 181,
  factor: 1.02,
};

/** PeriodType → 기본 앵커. */
export const DEFAULT_ANCHORS: Record<PeriodType, PeriodAnchors> = {
  MONTH: MONTH_ANCHORS,
  CUMULATIVE: CUMULATIVE_ANCHORS,
};

/**
 * 4키 — 대시보드 SUMIFS 집계 차원.
 *   gender   ← 칸반 CB(=VLOOKUP 대구분→대조합)  대시보드 A
 *   newcarry ← 칸반 H(구분)                      대시보드 B
 *   season   ← 칸반 G(시즌)                      대시보드 C
 *   item     ← 칸반 CA(=VLOOKUP 대분류→대조합)   대시보드 D
 */
export interface FactKey {
  gender: string;
  newcarry: string;
  season: string;
  item: string;
}

/**
 * 칸반 1행(SKU 리프) — Stage1 출력.
 * 19 기초지표 = 칸반 데이터열(SUMIF 흡수 + 안분). 4키 + skuKey 차원.
 * 칸반 컬럼 letter를 필드 주석에 병기(검증 대조용).
 */
export interface KanbanRow extends FactKey {
  /** A열 SKU 조인키(계절연도-MC). */
  skuKey: string;

  // ── 매출 (매출상세 RAW) ──
  /** M 판매수량 */
  m_qty: number;
  /** N 매출액 */
  n_sales: number;
  /** O 매출원가 */
  o_cogs: number;
  /** J 추정매출액 = (N/D1)*E1*F1 */
  j_estSales: number;
  /** P 일평균소진액 = O/D1 */
  p_dailyOut: number;

  // ── 재고: 물류(센터) (물류재고 RAW) ──
  /** Y 재고수량(물류) ← 물류재고!H */
  y_ctrQty: number;
  /** Z 재고액(물류) ← 물류재고!I */
  z_ctrAmt: number;
  /** AB 물류채화 재고수량 ← 물류재고!X */
  ab_ctrDeadQty: number;
  /** AC 물류채화 재고액 ← 물류재고!Y */
  ac_ctrDeadAmt: number;

  // ── 재고: 지점(점포) (점재고 RAW) ──
  /** AE 재고수량(지점) ← 점재고!H */
  ae_stoQty: number;
  /** AF 재고액(지점) ← 점재고!I */
  af_stoAmt: number;
  /** AH 지점채화 재고수량 ← 점재고!X */
  ah_stoDeadQty: number;
  /** AI 지점채화 재고액 ← 점재고!Y */
  ai_stoDeadAmt: number;

  // ── 기초재고 ──
  /** AL 기초(물류)재고액 ← 기초센터!I */
  al_openCtr: number;
  /** AM 기초(지점)재고액 ← 기초지점!I */
  am_openSto: number;
  /** AK 기초(전체)재고액 = AL+AM */
  ak_openAll: number;

  // ── 센터 입출고/반품 (센터입출고 RAW) ──
  /** AT 입고_벤더 수량 ← 센터입출고!I */
  at_inQty: number;
  /** AU 입고_벤더 금액 ← 센터입출고!H */
  au_inAmt: number;
  /** AZ 출고_점 수량 ← 센터입출고!M */
  az_outQty: number;
  /** BA 출고_점 금액 ← 센터입출고!L */
  ba_outAmt: number;
  /** BD 반품_센터 수량 ← 센터입출고!K */
  bd_retQty: number;
  /** BE 반품_센터 금액 ← 센터입출고!J */
  be_retAmt: number;
  /** AW 입출반 합계 수량 = AZ+BD+AT */
  aw_flowQty: number;

  // ── 안분 비중(칸반 AA·AY·BC 류) ──
  /** AA 물류재고비중(안분기준) = Y/$Y$8(재고수량 물류, leaf 수식 실측) */
  aa_ctrAmtPct: number;
  /** AY 입출반비중 = AW/$AW$8(전체) */
  ay_flowPct: number;

  // ── 물류비 안분 (BG/BN/BT/BV 및 세부) ──
  /** BI 임차료 */
  bi_rent: number;
  /** BK 수광비 */
  bk_receive: number;
  /** BG 공간비 = BI+BK */
  bg_space: number;
  /** BP 도급비 */
  bp_outsource: number;
  /** BR 정직원인건비 */
  br_staff: number;
  /** BN 인건비 = BP+BR */
  bn_labor: number;
  /** BT 운반비 */
  bt_freight: number;
  /** BX 박스비 */
  bx_box: number;
  /** BZ 부자재비 */
  bz_material: number;
  /** BV 포장비 = BX+BZ */
  bv_pack: number;
  /** K 물류비 = BG+BN+BT+BV */
  k_logiCost: number;
}

/**
 * 4키 집계 팩트행(Stage2 출력) — 대시보드 1행에 대응.
 * 19 데이터지표(SUM) + 10 파생지표(집계 후 재계산).
 * 레벨(L0~L5)은 키 값 유무로 구분(rollup 함수가 부여).
 */
export interface FactRow extends FactKey {
  /** 롤업 레벨 식별 라벨(전체/성별/신상이월/SS·FW/시즌소계/아이템리프 등) */
  level: FactLevel;

  // ── 19 데이터지표(가산, SUM 롤업) — 대시보드 letter 주석 ──
  /** E 실매출(추정) ← 칸반 J */
  sales: number;
  /** F 물류비 ← 칸반 K */
  logiCost: number;
  /** K 임차료 ← 칸반 BG */
  rent: number;
  /** L 인건비 ← 칸반 BN */
  labor: number;
  /** M 운반비 ← 칸반 BT */
  freight: number;
  /** N 포장비 ← 칸반 BV */
  pack: number;
  /** O 센터 재고량 ← 칸반 Y */
  ctrQty: number;
  /** P 센터 재고액 ← 칸반 Z */
  ctrAmt: number;
  /** T 점포 재고량 ← 칸반 AE */
  stoQty: number;
  /** U 점포 재고액 ← 칸반 AF */
  stoAmt: number;
  /** W 기초재고 전체 ← 칸반 AK */
  openAll: number;
  /** X 기초재고 물류 ← 칸반 AL */
  openCtr: number;
  /** Y 기초재고 지점 ← 칸반 AM */
  openSto: number;
  /** AD 소진액(일평균) ← 칸반 P */
  dailyOut: number;
  /** AF 입고 재고량 ← 칸반 AT */
  inQty: number;
  /** AG 출고 재고량 ← 칸반 AZ */
  outQty: number;
  /** AH 반품 재고량 ← 칸반 BD */
  retQty: number;
  /** AJ 센터체화 금액 ← 칸반 AC */
  ctrDeadAmt: number;
  /** AL 지점체화 금액 ← 칸반 AI */
  stoDeadAmt: number;

  // ── C10 입출반 금액(SUM 롤업) — 칸반에 존재(AU/BA/BE)하나 그동안 집계에 미반영.
  //    대시보드 RAW(센터입출고)에서 수량과 함께 금액도 집계 가능 → 슬라이드5 입출고/반품 '금액' 칸 파생.
  //    ※기존 19데이터+10파생 필드는 불변(신규 가산 필드 3개 추가뿐 — 아이템 회귀 무영향).
  /** 입고_벤더 금액 ← 칸반 AU(au_inAmt) */
  inAmt: number;
  /** 출고_점 금액 ← 칸반 BA(ba_outAmt) */
  outAmt: number;
  /** 반품_센터 금액 ← 칸반 BE(be_retAmt) */
  retAmt: number;

  // ── 10 파생지표(집계 후 행단위 재계산, 비율 합산 금지) ──
  /** G 물류비율 = F/E (null=공란) */
  logiRatio: number | null;
  /** H 총재고일수 = Z(평균재고전체)/AD */
  dotsTotal: number | null;
  /** I 센터재고일수 = AA(평균재고물류)/AD */
  dotsCtr: number | null;
  /** J 점포재고일수 = AB(평균재고지점)/AD */
  dotsSto: number | null;
  /** R 총기말재고액 = P+U */
  invAmtTotal: number;
  /** Z 평균재고 전체 = (W+R)/2 */
  avgInvTotal: number;
  /** AA 평균재고 물류 = (X+P)/2 */
  avgInvCtr: number;
  /** AB 평균재고 지점 = (Y+U)/2 */
  avgInvSto: number;
  /** AK 센터체화비중 = AJ/P (null=공란) */
  deadCtrPct: number | null;
  /** AM 지점체화비중 = AL/U (R7: AL/U 통일, null=공란) */
  deadStoPct: number | null;
}

/** 롤업 레벨(spec §5). */
export type FactLevel =
  | "L0_TOTAL" // 전체
  | "L1_GENDER" // 성별
  | "L2_NEWCARRY" // 신상/이월
  | "L3_SSFW" // SS/FW 그룹
  | "L4_SEASON" // 시즌소계(3키)
  | "L5_ITEM"; // 아이템리프(4키)

/** SS/FW 시즌 그룹 매핑(spec §5-1, 박혀있음). */
export const SS_SEASONS = ["봄", "여름"] as const;
export const FW_SEASONS = ["가을", "겨울", "공통"] as const;
