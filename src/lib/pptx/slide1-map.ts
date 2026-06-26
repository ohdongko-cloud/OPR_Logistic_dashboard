/**
 * 슬라이드1(① 물류 핵심지표 1P) 표 셀 → 엔진 노드/지표 매핑.
 *
 * 근거:
 *   - 02_파일분석/실적_모니터링_PPT보고서_분석.md (Slide 1: 행=전체→성별→신상/이월→시즌, 열=물류비·4대비용·재고일수·체화·입고/출고/반품)
 *   - 02_파일분석/엔진_transform_spec.md §5 (ROLLUP 레벨 L0~L3)
 *   - 원본 .pptx 실측: slide1 표 = 35행 × 26열, 데이터행 r04~r34, 데이터열 c02~c21.
 *
 * 원본 표 좌표(0-base, ET 파싱 실측):
 *   행: r00~r03 헤더(지표그룹/책임자명) · r04 전체 · r05 SS · r06 FW · r07 빈줄(스페이서)
 *       r08 여성 · r09 SS · r10 FW · r11 여성신상전체 · r12/r13 신상 SS/FW · r14 여성이월전체 · r15/r16 이월 SS/FW
 *       r17~r25 남성(동형) · r26~r34 아동(동형)
 *   열: c00 어느영역 · c01 누가(책임자) · c02~c21 데이터 · c22~c25 고객속도(엔진 미산출=그대로)
 *
 * 값 단위(원본 실측 ↔ 엔진 raw 환산):
 *   금액(물류비·임차·인건·운반·포장·센터/점포 재고액·체화액) = 원 → ÷1e6 반올림 (백만원, 천단위콤마)
 *   비율(물류비율·체화비중) = 0~1 → ×100, 1dp(물류비율)/0dp(체화비중) + '%'
 *   일수(총/센터/점포 재고일수) = 0dp 반올림
 *   수량(센터재고량·입고·출고·반품·점포재고량) = 0dp 반올림, 천단위콤마
 *
 * R7(점포체화비중 c21): 엔진=AL/U(정의값). 원본 .pptx는 AL/R 버그값(전체 17%) → 본 주입은 엔진값(정답)으로 채움.
 *   (엔진_transform_spec §6: 엔진이 옳음. 원본은 보존하되 산출값은 정의값으로 통일.)
 */

import type { FactRow } from "@/lib/engine";

/** 엔진 노드 식별 — period 무관, 4키 부분식별 + 롤업 레벨. */
export interface NodeRef {
  /** 표시/추적용 라벨(원본 표 c0 라벨과 동일 — 검증 주석). */
  label: string;
  /** 성별 필터(""=전체). */
  gender: string;
  /** 신상/이월 필터(""=전체). */
  newcarry: string;
  /** SS/FW 그룹 필터(null=시즌 무관). */
  ssfw: "SS" | "FW" | null;
  /** 롤업 레벨. */
  level: FactRow["level"];
}

/** 슬라이드1 표 데이터행(원본 좌표 row index) → 엔진 노드. */
export const SLIDE1_ROWS: Array<{ row: number } & NodeRef> = [
  // ── 전체 블록 ──
  { row: 4, label: "전체", gender: "", newcarry: "", ssfw: null, level: "L0_TOTAL" },
  { row: 5, label: "SS시즌", gender: "", newcarry: "", ssfw: "SS", level: "L3_SSFW" },
  { row: 6, label: "FW시즌", gender: "", newcarry: "", ssfw: "FW", level: "L3_SSFW" },
  // ── 여성 블록 ──
  { row: 8, label: "여성", gender: "여성", newcarry: "", ssfw: null, level: "L1_GENDER" },
  { row: 9, label: "여성 SS", gender: "여성", newcarry: "", ssfw: "SS", level: "L3_SSFW" },
  { row: 10, label: "여성 FW", gender: "여성", newcarry: "", ssfw: "FW", level: "L3_SSFW" },
  { row: 11, label: "여성 신상 전체", gender: "여성", newcarry: "신상", ssfw: null, level: "L2_NEWCARRY" },
  { row: 12, label: "여성 신상 SS", gender: "여성", newcarry: "신상", ssfw: "SS", level: "L3_SSFW" },
  { row: 13, label: "여성 신상 FW", gender: "여성", newcarry: "신상", ssfw: "FW", level: "L3_SSFW" },
  { row: 14, label: "여성 이월 전체", gender: "여성", newcarry: "이월", ssfw: null, level: "L2_NEWCARRY" },
  { row: 15, label: "여성 이월 SS", gender: "여성", newcarry: "이월", ssfw: "SS", level: "L3_SSFW" },
  { row: 16, label: "여성 이월 FW", gender: "여성", newcarry: "이월", ssfw: "FW", level: "L3_SSFW" },
  // ── 남성 블록 ──
  { row: 17, label: "남성", gender: "남성", newcarry: "", ssfw: null, level: "L1_GENDER" },
  { row: 18, label: "남성 SS", gender: "남성", newcarry: "", ssfw: "SS", level: "L3_SSFW" },
  { row: 19, label: "남성 FW", gender: "남성", newcarry: "", ssfw: "FW", level: "L3_SSFW" },
  { row: 20, label: "남성 신상 전체", gender: "남성", newcarry: "신상", ssfw: null, level: "L2_NEWCARRY" },
  { row: 21, label: "남성 신상 SS", gender: "남성", newcarry: "신상", ssfw: "SS", level: "L3_SSFW" },
  { row: 22, label: "남성 신상 FW", gender: "남성", newcarry: "신상", ssfw: "FW", level: "L3_SSFW" },
  { row: 23, label: "남성 이월 전체", gender: "남성", newcarry: "이월", ssfw: null, level: "L2_NEWCARRY" },
  { row: 24, label: "남성 이월 SS", gender: "남성", newcarry: "이월", ssfw: "SS", level: "L3_SSFW" },
  { row: 25, label: "남성 이월 FW", gender: "남성", newcarry: "이월", ssfw: "FW", level: "L3_SSFW" },
  // ── 아동 블록 ──
  { row: 26, label: "아동", gender: "아동", newcarry: "", ssfw: null, level: "L1_GENDER" },
  { row: 27, label: "아동 SS", gender: "아동", newcarry: "", ssfw: "SS", level: "L3_SSFW" },
  { row: 28, label: "아동 FW", gender: "아동", newcarry: "", ssfw: "FW", level: "L3_SSFW" },
  { row: 29, label: "아동 신상 전체", gender: "아동", newcarry: "신상", ssfw: null, level: "L2_NEWCARRY" },
  { row: 30, label: "아동 신상 SS", gender: "아동", newcarry: "신상", ssfw: "SS", level: "L3_SSFW" },
  { row: 31, label: "아동 신상 FW", gender: "아동", newcarry: "신상", ssfw: "FW", level: "L3_SSFW" },
  { row: 32, label: "아동 이월 전체", gender: "아동", newcarry: "이월", ssfw: null, level: "L2_NEWCARRY" },
  { row: 33, label: "아동 이월 SS", gender: "아동", newcarry: "이월", ssfw: "SS", level: "L3_SSFW" },
  { row: 34, label: "아동 이월 FW", gender: "아동", newcarry: "이월", ssfw: "FW", level: "L3_SSFW" },
];

/** 셀 값 포맷 종류. */
export type PptScale = "mio" | "pct1" | "pct0" | "days" | "qty";

/** 슬라이드1 표 데이터열(원본 좌표 col index) → 엔진 FactRow 필드 + 포맷. */
export const SLIDE1_COLS: Array<{ col: number; field: keyof FactRow; scale: PptScale; label: string }> = [
  { col: 2, field: "logiCost", scale: "mio", label: "물류비 금액" },
  { col: 3, field: "logiRatio", scale: "pct1", label: "물류비율" },
  { col: 4, field: "dotsTotal", scale: "days", label: "총재고일수" },
  { col: 5, field: "dotsCtr", scale: "days", label: "센터재고일수" },
  { col: 6, field: "dotsSto", scale: "days", label: "점포재고일수" },
  { col: 7, field: "rent", scale: "mio", label: "임차료" },
  { col: 8, field: "labor", scale: "mio", label: "인건비" },
  { col: 9, field: "freight", scale: "mio", label: "운반비" },
  { col: 10, field: "pack", scale: "mio", label: "포장비" },
  { col: 11, field: "ctrQty", scale: "qty", label: "센터재고수량" },
  { col: 12, field: "ctrAmt", scale: "mio", label: "센터재고금액" },
  { col: 13, field: "ctrDeadAmt", scale: "mio", label: "센터체화금액" },
  { col: 14, field: "deadCtrPct", scale: "pct0", label: "센터체화비중" },
  { col: 15, field: "inQty", scale: "qty", label: "입고수량" },
  { col: 16, field: "outQty", scale: "qty", label: "출고수량" },
  { col: 17, field: "retQty", scale: "qty", label: "반품수량" },
  { col: 18, field: "stoQty", scale: "qty", label: "점포재고수량" },
  { col: 19, field: "stoAmt", scale: "mio", label: "점포재고금액" },
  { col: 20, field: "stoDeadAmt", scale: "mio", label: "점포체화금액" },
  { col: 21, field: "deadStoPct", scale: "pct0", label: "점포체화비중(R7=AL/U)" },
];

/** 슬라이드1 표 차원: 행 35 × 열 26 (원본 실측 — 무결성 가드). */
export const SLIDE1_TABLE_DIMS = { rows: 35, cols: 26 } as const;

/**
 * 엔진 raw 값 → 원본 .pptx 표시 문자열.
 * null(분모0=공란)은 빈 문자열("") — 원본 빈칸과 동일 표시.
 */
export function formatPptCell(scale: PptScale, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  switch (scale) {
    case "mio": {
      // 원 → 백만원, 0dp, 천단위 콤마.
      return Math.round(v / 1e6).toLocaleString("en-US");
    }
    case "pct1":
      return `${(v * 100).toFixed(1)}%`;
    case "pct0":
      return `${Math.round(v * 100)}%`;
    case "days":
      return `${Math.round(v)}`;
    case "qty":
      return Math.round(v).toLocaleString("en-US");
    default:
      return String(v);
  }
}
