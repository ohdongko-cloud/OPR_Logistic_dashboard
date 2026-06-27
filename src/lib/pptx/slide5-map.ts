/**
 * 슬라이드5(물류 1P 노출판 — 목표 대비) 표 셀 → 엔진 FactRow + Annotation(목표·전년·조치) 매핑.
 *
 * 근거:
 *   - 02_파일분석/실적_모니터링_PPT보고서_분석.md (Slide5: Slide1 동형 + 목표/전년/현재 + 조치/비고)
 *   - 원본 .pptx 실측: slide5 표 = 40행 × 30열. 헤더 r00~r03, 데이터행 r04~r39.
 *   - 원본 헤더 실측(r02 라벨):
 *       물류비율: c03 목표 · c04 전년 · c05 1분기 · c06 현재
 *       센터재고일수: c08 목표 · c09 전년 · c10 현재
 *       비용영역(4대비용): c11 임차료 · c12 인건비 · c13 운반비 · c14 포장비
 *       재고운영: c15 센터재고수량 · c16 센터재고금액 · c17 체화비중 · c18 체화금액
 *       센터운영: c19 입고수량 · c20 입고금액 · c21 출고수량 · c22 출고금액 · c23 반품수량 · c24 반품금액
 *       고객속도: c25 입고/상품화 전년 · c26 현재 · c27 피킹/출고 전년 · c28 현재
 *       c29 조치/비고
 *
 * 행 매핑(원본 좌표 row → 엔진 노드):
 *   r04 = 전체(L0_TOTAL) · r05 = 여성 · r06 = 남성 · r07 = 아동 (L1_GENDER)
 *   ※r08~r39 = 사업부/지점 세부 블록(여성_OPR·이노베이션 등) — 아이템 엔진 4키(성별/신상이월/시즌) grain
 *     과 매핑할 마스터(사업부코드→4키)가 없음 → 자동 주입 안 함(공란 유지, 가짜값 금지).
 *
 * 값 단위 = 슬라이드1 formatPptCell 과 동일(재사용).
 *   현재값: 엔진 FactRow. 목표/전년: Annotation(numValue, 동일 단위 가정). 1분기: annotation 없음 → 공란.
 *   입고/출고/반품 "금액"(c20/c22/c24): 엔진 FactRow 에 금액 필드 없음(수량만) → 공란.
 *   고객속도(c25~c28): 엔진 미산출(spec) → 공란/수기. 조치(c29): Annotation ACTION.
 */

import type { FactRow } from "@/lib/engine";
import type { NodeRef } from "./slide1-map";
import type { PptScale } from "./slide1-map";

/** 슬5 표 데이터행(원본 좌표 row) → 엔진 노드(슬1 NodeRef 와 동형). */
export const SLIDE5_ROWS: Array<{ row: number } & NodeRef> = [
  { row: 4, label: "전체", gender: "", newcarry: "", ssfw: null, level: "L0_TOTAL" },
  { row: 5, label: "여성", gender: "여성", newcarry: "", ssfw: null, level: "L1_GENDER" },
  { row: 6, label: "남성", gender: "남성", newcarry: "", ssfw: null, level: "L1_GENDER" },
  { row: 7, label: "아동", gender: "아동", newcarry: "", ssfw: null, level: "L1_GENDER" },
];

/**
 * 슬5 "현재값" 데이터열(엔진 FactRow) — 원본 좌표 col + 포맷.
 * (목표/전년/조치 열은 별도 SLIDE5_ANNO_CELLS 에서 annotation 으로 채움.)
 */
export const SLIDE5_CURRENT_COLS: Array<{
  col: number;
  field: keyof FactRow;
  scale: PptScale;
  label: string;
}> = [
  { col: 6, field: "logiRatio", scale: "pct1", label: "물류비율(현재)" },
  { col: 7, field: "logiCost", scale: "mio", label: "물류비(금액)" },
  { col: 10, field: "dotsCtr", scale: "days", label: "센터재고일수(현재)" },
  { col: 11, field: "rent", scale: "mio", label: "임차료" },
  { col: 12, field: "labor", scale: "mio", label: "인건비" },
  { col: 13, field: "freight", scale: "mio", label: "운반비" },
  { col: 14, field: "pack", scale: "mio", label: "포장비" },
  { col: 15, field: "ctrQty", scale: "qty", label: "센터재고수량" },
  { col: 16, field: "ctrAmt", scale: "mio", label: "센터재고금액" },
  { col: 17, field: "deadCtrPct", scale: "pct0", label: "체화비중" },
  { col: 18, field: "ctrDeadAmt", scale: "mio", label: "체화금액" },
  { col: 19, field: "inQty", scale: "qty", label: "입고수량" },
  // c20 입고금액 — 엔진 금액필드 없음 → 공란
  { col: 21, field: "outQty", scale: "qty", label: "출고수량" },
  // c22 출고금액 — 공란
  { col: 23, field: "retQty", scale: "qty", label: "반품수량" },
  // c24 반품금액 — 공란
  // c25~c28 고객속도(입고/상품화·피킹/출고 전년/현재) — 엔진 미산출 → 공란/수기
];

/** annotation 주입 셀 종류. */
export type Slide5AnnoKind = "target" | "priorYear" | "action";

/**
 * 슬5 annotation 셀(목표·전년·조치) — 원본 좌표 col + annotation 식별.
 *   target/priorYear = 지표코드(metricCode) 기준 numValue, 슬1 포맷 단위로 표시.
 *   action = 노드 ACTION 본문(텍스트). annotation 없으면 공란(가짜값 금지).
 */
export const SLIDE5_ANNO_CELLS: Array<{
  col: number;
  kind: Slide5AnnoKind;
  /** target/priorYear 의 지표코드(FactRow 필드명과 동일). action 은 무시. */
  metricCode?: keyof FactRow;
  /** target/priorYear 표시 포맷(슬1 scale). */
  scale?: PptScale;
  label: string;
}> = [
  { col: 3, kind: "target", metricCode: "logiRatio", scale: "pct1", label: "물류비율 목표" },
  { col: 4, kind: "priorYear", metricCode: "logiRatio", scale: "pct1", label: "물류비율 전년" },
  // c05 1분기 — annotation 종류 없음(미지원) → 공란.
  { col: 8, kind: "target", metricCode: "dotsCtr", scale: "days", label: "센터재고일수 목표" },
  { col: 9, kind: "priorYear", metricCode: "dotsCtr", scale: "days", label: "센터재고일수 전년" },
  { col: 29, kind: "action", label: "조치/비고" },
];

/** 슬5 표 차원: 행 40 × 열 30 (원본 실측 — 무결성 가드). */
export const SLIDE5_TABLE_DIMS = { rows: 40, cols: 30 } as const;
