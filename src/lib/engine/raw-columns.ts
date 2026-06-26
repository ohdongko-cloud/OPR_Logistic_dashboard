/**
 * RAW 시트별 컬럼 letter 핀고정 — 실파일(`#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx`)
 * 4행 라벨 + 데이터 실측(2026-06-26)으로 200/200 검증된 좌표.
 *
 * 두 부류:
 *  - 측정값(measure) 컬럼: 칸반 SUMIF 합산 대상.
 *  - 분류(dim) 컬럼: 칸반 C/D/G/H 차원 — RAW 시트별 위치 상이(매출상세 vs 재고류 vs 센터입출고).
 *
 * ⚠️ 센터입출고 H=금액 / I=수량 역전(재고시트 H=수량과 반대) — spec §2 주의사항.
 */

import { type SheetType } from "@/lib/ingest/sheet-types";

/** RAW 시트별 분류(차원) 컬럼 letter — 칸반 C/D/G/H 원천. */
export interface DimColumns {
  /** C 대구분(여성/남성/아동/골드여성/골드남성) → VLOOKUP gender 입력 */
  daegubun: string;
  /** D 대분류(잡화/내의/상의/하의/스포츠/캐쥬얼/정장/골프/아동…) → VLOOKUP item 입력 */
  daebunlyu: string;
  /** G 시즌(봄/여름/가을/겨울/공통) */
  season: string;
  /** H 구분(신상/이월) */
  newcarry: string;
}

/**
 * 시트별 분류 컬럼 위치(실측 핀고정).
 *  매출상세 : O/R/T/U
 *  재고 4탭 : Q/T/V/W
 *  센터입출고: R/U/W/X
 */
export const DIM_COLUMNS: Record<SheetType, DimColumns | null> = {
  매출상세: { daegubun: "O", daebunlyu: "R", season: "T", newcarry: "U" },
  물류재고: { daegubun: "Q", daebunlyu: "T", season: "V", newcarry: "W" },
  점재고: { daegubun: "Q", daebunlyu: "T", season: "V", newcarry: "W" },
  기초재고_센터: { daegubun: "Q", daebunlyu: "T", season: "V", newcarry: "W" },
  기초재고_지점: { daegubun: "Q", daebunlyu: "T", season: "V", newcarry: "W" },
  센터입출고: { daegubun: "R", daebunlyu: "U", season: "W", newcarry: "X" },
  물류비예측: null,
  분류: null,
};

/**
 * SKU 분류 우선순위 — 동일 SKU가 여러 RAW에 있을 때 어느 시트 분류를 쓸지.
 *
 * ★실측 확정(엑셀 칸반 C열 3451행 forward-fill 대조): 이 순서가 0 mismatch.
 *   매출상세 → 점재고 → 물류재고 → 센터입출고 → 기초센터 → 기초지점.
 *   (SAP 추출 시 동일 SKU 대구분이 시트 간 불일치 26건 존재 — 칸반은 점재고를 물류재고보다
 *    우선. 순서 어긋나면 26 SKU 의 성별 오분류 → 집계 불일치.)
 */
export const DIM_PRIORITY: SheetType[] = [
  "매출상세",
  "점재고",
  "물류재고",
  "센터입출고",
  "기초재고_센터",
  "기초재고_지점",
];

/** 측정값 컬럼 — 칸반 SUMIF 합산 대상(시트별). */
export const MEASURE_COLUMNS = {
  /** 매출상세: H=실매출액 · I=총매출원가 · J=판매수량 */
  매출상세: { sales: "H", cogs: "I", qty: "J" },
  /** 물류재고: H=재고량 · I=재고액(V-,원가) · X=체화량 · Y=체화액 */
  물류재고: { qty: "H", amt: "I", deadQty: "X", deadAmt: "Y" },
  /** 점재고: H=재고량 · I=재고액 · X=체화량 · Y=체화액 */
  점재고: { qty: "H", amt: "I", deadQty: "X", deadAmt: "Y" },
  /** 센터입출고: H=벤더입고액 · I=벤더입고량 · J=점간입고액 · K=점간입고량 · L=점간출고액 · M=점간출고량 */
  센터입출고: {
    inAmt: "H",
    inQty: "I",
    retAmt: "J",
    retQty: "K",
    outAmt: "L",
    outQty: "M",
  },
  /** 기초재고(센터): I=재고액(V-,원가) */
  기초재고_센터: { amt: "I" },
  /** 기초재고(지점): I=재고액(V-,원가) */
  기초재고_지점: { amt: "I" },
} as const;

/**
 * 물류비 예측 시트 7개 총액 셀(spec §2 · §3-3).
 *  C5 임차료 · C14 수광비 · C7 정직원인건비 · C8 도급인건비 · C9 운반비 · C15 박스 · C16 부자재.
 * 셀 직접 참조(SUMIF 아님). data 맵은 colLetter→value 이므로 행 인덱싱 필요 → 별도 추출.
 */
export const LOGI_COST_CELLS = {
  rent: { col: "C", row: 5 },
  receive: { col: "C", row: 14 },
  staff: { col: "C", row: 7 },
  outsource: { col: "C", row: 8 },
  freight: { col: "C", row: 9 },
  box: { col: "C", row: 15 },
  material: { col: "C", row: 16 },
} as const;

/** 분류 마스터(#분류) VLOOKUP 컬럼. */
export const CLASS_COLUMNS = {
  /** 성별 VLOOKUP C:D — C=대구분(키), D=대조합(반환=gender). */
  genderKey: "C",
  genderVal: "D",
  /** 아이템 VLOOKUP S:U,2 — S=대분류(키), T=대조합(반환=item, 2번째 컬럼). */
  itemKey: "S",
  itemVal: "T",
} as const;
