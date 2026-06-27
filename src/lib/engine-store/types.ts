/**
 * 매장(점포) 엔진 공용 타입 — 칸반(Stage1) · 3단 대시보드(Stage2).
 *
 * 근거: 02_파일분석/엔진_transform_spec_매장.md (§0~§8) · 실파일 셀 실측(2026-06-26).
 *
 * 흐름:
 *   RAW 5시트 ─Stage1→ StoreKanbanRow[] (점포 1행, 35열: 식별3+KPI4+픽스15+전체13)
 *            ─Stage2→ StoreDashboard (전체→채널→점포 3단 + 대시보드 행별 분기 + (−)재고)
 *
 * 아이템 엔진과 차이(spec §8): VLOOKUP 단일키 조인 · 채널 1차원 SUMIF · 3단 계층 ·
 *   좌(픽스)/우(전체) 다중블록 · 핵심 파라미터 = C1(영업일수) 1개 + 점포 기준 마스터.
 */

/** 채널(칸반 B = SUMIF 그룹키). */
export type StoreChannel = "직영" | "중간관리" | "기타";

export const STORE_CHANNELS: StoreChannel[] = ["직영", "중간관리", "기타"];

/**
 * 매장 엔진 파라미터(spec §6 하드코딩 → 파라미터화).
 *   workDays = 칸반 C1(영업일수, 당월=21) — O·AD(일평균원가) 분모 → E·F 재고일수 지배.
 *   weekRunDivisor = 대시 M/R `=N/3`·`=S/3` 주판량 3개월환산 계수(=3).
 */
export interface StoreParams {
  /** C1 영업일수 */
  workDays: number;
  /** 주판량 환산 계수(대시 M/R 의 판매량 ÷ 3 환산) */
  weekRunDivisor: number;
}

/** 당월 기본 파라미터(실파일 칸반 C1=21 · 대시 /3 실측). */
export const MONTH_STORE_PARAMS: StoreParams = {
  workDays: 21,
  weekRunDivisor: 3,
};

/**
 * 칸반 1행(점포 리프 또는 채널/전체 집계) — Stage1/Stage2 출력.
 * 35열 = 식별(A~C) + KPI(D~G) + 픽스블록(H~V) + 전체블록(W~AI).
 * 칸반 컬럼 letter 를 필드 주석에 병기(검증 대조용). 데이터열=number, 파생열=number|null(IFERROR "").
 */
export interface StoreKanbanRow {
  /** A 점포코드(VLOOKUP 단일 조인키). 집계행은 채널 라벨. */
  storeCode: string;
  /** B 구분(채널). */
  channel: StoreChannel;
  /** C 지점명(수불오차 조인키 — 점포행). */
  storeName: string;

  // ── KPI(D~G) 파생 ──
  /** D 판매배수 = AA/W (전체판매량/전체입고량) */
  saleMult: number | null;
  /** E 픽스 재고일수 = V/O */
  dotsFix: number | null;
  /** F 전체 재고일수 = AI/AD */
  dotsAll: number | null;
  /** G 여름비중 = Q/S (둘 다 금액) */
  summerPct: number | null;

  // ── 픽스블록(H~V) ──
  /** H 입고량(픽스) ← 상품수불 B:I idx6=G(점간입고량) */
  inQtyFix: number;
  /** I 입고액(픽스) ← 상품수불 idx5=F(점간입고액) */
  inAmtFix: number;
  /** J 반품량(픽스) ← 상품수불 idx8=I(점간출고량) */
  retQtyFix: number;
  /** K 반품액(픽스) ← 상품수불 idx7=H(점간출고액) */
  retAmtFix: number;
  /** L 판매량(픽스) ← 매출 B:F idx5=F(판매수량) */
  saleQtyFix: number;
  /** M 판매액(픽스) ← 매출 idx3=D(실매출액) */
  saleAmtFix: number;
  /** N 매출원가(픽스) ← 매출 idx4=E(총매출원가) */
  cogsFix: number;
  /** O 일평균매출원가(픽스) = N/C1 */
  dailyCogsFix: number | null;
  /** P 여름/공통 재고량 ← 기말 K:N idx3=M */
  summerInvQty: number;
  /** Q 여름/공통 재고액 ← 기말 K:N idx4=N */
  summerInvAmt: number;
  /** R 재고량(픽스) ← 기말 B:E idx3=D */
  invQtyFix: number;
  /** S 재고액(픽스) ← 기말 B:E idx4=E */
  invAmtFix: number;
  /** T 기초재고량(픽스) ← 기초 B:E idx3=D */
  openQtyFix: number;
  /** U 기초재고액(픽스) ← 기초 B:E idx4=E */
  openAmtFix: number;
  /** V 평균재고액(픽스) = (S+U)/2 */
  avgInvFix: number | null;

  // ── 전체블록(W~AI) ──
  /** W 입고량(전체) ← 상품수불 K:R idx6=P */
  inQtyAll: number;
  /** X 입고액(전체) ← 상품수불 K:R idx5=O */
  inAmtAll: number;
  /** Y 반품량(전체) ← 상품수불 K:R idx8=R */
  retQtyAll: number;
  /** Z 반품액(전체) ← 상품수불 K:R idx7=Q */
  retAmtAll: number;
  /** AA 판매량(전체) ← 매출 I:M idx5=M */
  saleQtyAll: number;
  /** AB 판매액(전체) ← 매출 I:M idx3=K */
  saleAmtAll: number;
  /** AC 매출원가(전체) ← 매출 I:M idx4=L */
  cogsAll: number;
  /** AD 일평균매출원가(전체) = AC/C1 */
  dailyCogsAll: number | null;
  /** AE 기말재고량(전체) ← 기말 T:W idx3=V */
  invQtyAll: number;
  /** AF 기말재고액(전체) ← 기말 T:W idx4=W */
  invAmtAll: number;
  /** AG 기초재고량(전체) ← 기초 K:N idx3=M */
  openQtyAll: number;
  /** AH 기초재고액(전체) ← 기초 K:N idx4=N */
  openAmtAll: number;
  /** AI 평균재고액(전체) = (AF+AH)/2 */
  avgInvAll: number | null;
}

/** 칸반 데이터열(가산 SUM 대상) 필드 키 — 파생열 제외. */
export const KANBAN_DATA_FIELDS = [
  "inQtyFix",
  "inAmtFix",
  "retQtyFix",
  "retAmtFix",
  "saleQtyFix",
  "saleAmtFix",
  "cogsFix",
  "summerInvQty",
  "summerInvAmt",
  "invQtyFix",
  "invAmtFix",
  "openQtyFix",
  "openAmtFix",
  "inQtyAll",
  "inAmtAll",
  "retQtyAll",
  "retAmtAll",
  "saleQtyAll",
  "saleAmtAll",
  "cogsAll",
  "invQtyAll",
  "invAmtAll",
  "openQtyAll",
  "openAmtAll",
] as const satisfies readonly (keyof StoreKanbanRow)[];

export type KanbanDataField = (typeof KANBAN_DATA_FIELDS)[number];

/** 매장 계층 레벨(3단). */
export type StoreLevel = "L0_TOTAL" | "L1_CHANNEL" | "L2_STORE";

/**
 * 대시보드 출력 1행 — 집계행(전체/채널) 또는 점포 카드.
 * ※지점대시보드 컬럼 매핑(spec §3 머신 매핑).
 *   D 판매배수 · E 재고일수(행별 분기) · F 시즌비중(행별 분기) · G 재고보유율(행별 분기)
 *   H~K 기준 마스터(하드코딩 — 운영평수·기준재고/진열/주판) · L~T 측정/주판 · V/W (−)재고
 */
export interface StoreDashRow {
  /** A 코드(점포) 또는 채널 라벨(전체/직영/중간관리/기타). */
  code: string;
  /** B 구분(채널) — 점포행은 자기 채널. */
  channel: string;
  /** C 지점명(점포행). 집계행은 빈값. */
  name: string;
  level: StoreLevel;

  // KPI(행별 분기)
  /** D 판매배수 ← 칸반 D(idx4) */
  saleMult: number | null;
  /** E 재고일수 — 집계(전체/중관/기타)=칸반 F(전체재고일수 idx6) · 직영/점포=칸반 E(픽스 idx5) */
  dotsDays: number | null;
  /** F 시즌비중 — 집계 = O/T(전체재고량 분모) · 직영/점포 = O/P(픽스재고량 분모) */
  seasonPct: number | null;
  /** G 재고보유율 — 집계 = T/I · 직영/점포 = P/I (I=기준재고량 하드코딩) */
  stockRatio: number | null;

  // ── 비율 가드용 carry 분모(행종류 분기 실분모 — 희소판정 정확성) ──
  /**
   * E 재고일수의 실제 분모(일평균매출원가): 집계=일평균전체원가(AD=cogsAll/C1) · 직영/점포=일평균픽스원가(O=cogsFix/C1).
   * 단위=금액(원). 가드는 이 값을 직접 써 행종류와 무관하게 정확히 희소판정한다.
   * null=분모0(IFERROR 공란) — 가드 무관.
   */
  dotsDaysDenom: number | null;
  /**
   * F 시즌비중의 실제 분모(재고'량'): 집계=전체재고량(T=invQtyAll) · 직영/점포=픽스재고량(P=invQtyFix).
   * 단위=수량(PCS). (산식이 Q/S 금액이 아니라 summerInvQty/invQty* 수량임 — 가드 단위도 qty.)
   */
  seasonPctDenom: number | null;

  // 기준 마스터(하드코딩 — 점포 큐레이션 입력)
  /** H 운영평수 */
  areaPyeong: number | null;
  /** I 기준재고량(재고보유율 분모) */
  baseInvQty: number | null;
  /** J 기준진열량 */
  baseDisplayQty: number | null;
  /** K 기준주판량 */
  baseRunQty: number | null;

  // 측정·주판(칸반 VLOOKUP / 파생)
  /** L 픽스입고량 ← 칸반 H(idx8) */
  inQtyFix: number;
  /** M 픽스주판량 = N/3 */
  runQtyFix: number | null;
  /** N 픽스판매량 ← 칸반 L(idx12) */
  saleQtyFix: number;
  /** O 여름재고량 ← 칸반 P(idx16) */
  summerInvQty: number;
  /** P 픽스재고량 ← 칸반 R(idx18) */
  invQtyFix: number;
  /** Q 전체입고량 ← 칸반 W(idx23) */
  inQtyAll: number;
  /** R 전체주판량 = S/3 */
  runQtyAll: number | null;
  /** S 전체판매량 ← 칸반 AA(idx27) */
  saleQtyAll: number;
  /** T 전체재고량 ← 칸반 AE(idx31) */
  invQtyAll: number;

  // (−)마이너스재고(수불오차 직참)
  /** V (−)재고 수량 */
  negQty: number | null;
  /** W (−)재고 금액 */
  negAmt: number | null;
}

/**
 * 점포 기준 마스터(대시보드 H~K 하드코딩 — spec §6 파라미터화 대상).
 * 점포코드 → 운영평수·기준재고/진열/주판량.
 * 실파일은 대시보드 시트에 박혀있어 ingest 가 거기서 읽는다(코드 하드코딩 금지·보안).
 */
export interface StoreMaster {
  areaPyeong: number | null;
  baseInvQty: number | null;
  baseDisplayQty: number | null;
  baseRunQty: number | null;
}

/**
 * 점포 큐레이션(대시보드 카드 노출 점포 — 실파일은 직영 14점).
 * codes 순서 = 카드 표시 순서. masters = 코드별 기준 마스터.
 * 집계행(전체/직영/중간관리/기타)의 마스터도 포함(전체·직영 행에 운영평수 합계).
 */
export interface StoreCuration {
  /** 카드 노출 점포코드(순서대로). */
  codes: string[];
  /** 코드(점포·채널라벨) → 기준 마스터. */
  masters: Record<string, StoreMaster>;
}

/** 수불오차(마이너스재고) — 코드키·이름키 이원화 조회 인덱스. */
export interface StoreErrorIndex {
  /** 코드(구매그룹) → {수량 G, 금액 H}. 집계행 조회용. */
  byCode: Map<string, { negQty: number | null; negAmt: number | null }>;
  /** 정규화 지점명 → {수량 G, 금액 H}. 점포행 조회용. */
  byName: Map<string, { negQty: number | null; negAmt: number | null }>;
}
