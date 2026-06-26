/**
 * RAW 시트 타입 정의 + 헤더 시그니처 (실파일 기반 핀고정).
 *
 * 근거:
 *  - 아키텍처 문서 §1-3 enum SheetType · §2-2 "헤더 시그니처(detect.ts 패턴)"
 *  - 실파일 `#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx` 6 RAW 탭 r1~r7 실측
 *    (R1 블로커 해소 — 실제 헤더로 컬럼 핀고정).
 *
 * RAW 탭 공통 구조(실측):
 *   r1 = 리포트명("매출상세분석"/"일재고분석"/"일상품수불장")
 *   r2 = 조회일·CU·플랜트
 *   r3 = 열번호
 *   r4 = 측정항목 라벨(실 매출액·재고량·벤더입고액 …)   ← 시그니처 주 식별행
 *   r5 = 차원/단위 라벨(계절연도+계절(Now)·MC(자재그룹)(Now)·KRW …)
 *   r6 = "전체 결과" 총계행 (★데이터 아님 — 스킵)
 *   r7~ = 데이터(A열 = SKU키 "계절연도-MC자재그룹")
 *
 * → 시그니처는 r4+r5 를 합쳐 식별(시트명에 의존하지 않음 — 참조앱 detect.ts 패턴).
 *   재고 4탭(점/물류/기초2)은 측정라벨이 동일하므로 r1(리포트명)·체화 유무로 구분.
 */

/** Prisma `SheetType` enum 값과 1:1 (스키마 enum 멤버명). */
export type SheetType =
  | "매출상세"
  | "점재고"
  | "물류재고"
  | "센터입출고"
  | "기초재고_센터"
  | "기초재고_지점"
  | "물류비예측"
  | "분류";

/** 업로드 1세트에 반드시 존재해야 하는 RAW 시트(올오어낫싱 검증 대상). */
export const REQUIRED_RAW_SHEETS: SheetType[] = [
  "매출상세",
  "점재고",
  "물류재고",
  "센터입출고",
  "기초재고_지점",
  "기초재고_센터",
];

export interface SheetSignature {
  type: SheetType;
  /** 사람용 라벨 */
  label: string;
  /** 원본 워크북에서 흔히 쓰이는 시트명(폴백 힌트 — 판별은 헤더 우선). */
  sheetNameHints: string[];
  /**
   * 헤더(r1~r6 병합 정규화 문자열)에 모두 substring 매칭되어야 하는 토큰.
   * 정규화(normalizeForSig) 후 비교.
   */
  required: string[];
  /** 가산점용(선택) — 동률 타이브레이크. */
  optional?: string[];
  /** 데이터 시작 행(1-based). RAW 탭은 7(총계행 r6 다음). */
  dataStartRow: number;
  /** 총계행("전체 결과") 위치(1-based) — 스킵 대상. 없으면 0. */
  totalRow: number;
}

/**
 * 6 RAW + 물류비예측 + 분류 시그니처.
 * 재고 4탭은 측정라벨("재고량","재고액(V-,원가)")이 동일 → 리포트명(r1)·기준맥락으로 구분.
 *   - 점재고/물류재고 : 리포트명 "일재고분석" + 체화량/체화액 보유(r5 끝).
 *   - 기초재고(지점/센터): 리포트명 "일재고분석"·조회일 05-31, 체화 없음.
 * 시트명 힌트가 1순위 폴백(원본 시트명이 명확하므로), 헤더 시그니처는 교차검증.
 */
export const SHEET_SIGNATURES: SheetSignature[] = [
  {
    type: "매출상세",
    label: "매출상세분석 (SAP 매출 RAW)",
    sheetNameHints: ["매출상세분석", "매출상세"],
    required: ["매출상세분석", "실매출액", "총매출원가", "판매수량"],
    optional: ["계절연도+계절", "mc자재그룹"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "점재고",
    label: "점재고 (SAP 매장 일재고 RAW)",
    sheetNameHints: ["점재고"],
    required: ["일재고분석", "재고량", "체화량", "체화액"],
    optional: ["이동평균가", "현판가"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "물류재고",
    label: "물류재고 (SAP 센터 일재고 RAW)",
    sheetNameHints: ["물류재고"],
    required: ["일재고분석", "재고량", "체화량", "체화액"],
    optional: ["이동평균가", "현판가"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "센터입출고",
    label: "센터입출고 (SAP 일상품수불장 RAW)",
    sheetNameHints: ["센터입출고"],
    required: ["일상품수불장", "벤더입고액", "벤더입고량", "점간출고량"],
    optional: ["점간입고량", "점간출고액"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "기초재고_지점",
    label: "기초재고(지점) (SAP 지점 월초재고 RAW)",
    sheetNameHints: ["기초재고(지점)", "기초재고지점"],
    required: ["일재고분석", "재고량", "재고액"],
    optional: ["계절연도+계절", "mc자재그룹"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "기초재고_센터",
    label: "기초재고(센터) (SAP 센터 월초재고 RAW)",
    sheetNameHints: ["기초재고(센터)", "기초재고센터"],
    required: ["일재고분석", "재고량", "재고액"],
    optional: ["계절연도+계절", "mc자재그룹"],
    dataStartRow: 7,
    totalRow: 6,
  },
  {
    type: "물류비예측",
    label: "물류비 예측 (수기 총비용 입력원)",
    sheetNameHints: ["물류비 예측", "물류비예측"],
    // "물류비 합계"(물류비합계)는 이 시트에만 존재 — 칸반·대시보드 오탐 방지(실측 확인).
    required: ["물류비합계", "공간비", "인건비"],
    optional: ["운반비", "물류비율"],
    dataStartRow: 1,
    totalRow: 0,
  },
  {
    type: "분류",
    label: "#분류 (분류 마스터)",
    sheetNameHints: ["#분류", "분류"],
    // "대조합"+"복종" 조합은 #분류 마스터에만 존재(실측 확인) — 칸반 오탐 방지.
    required: ["대조합", "복종", "아이템"],
    optional: ["구매그룹", "소분류"],
    dataStartRow: 1,
    totalRow: 0,
  },
];

export const ALL_SHEET_TYPES: SheetType[] = SHEET_SIGNATURES.map((s) => s.type);

/** 시트명 힌트로 SheetType 폴백 매칭(헤더 판별 실패 시). */
export function matchByName(sheetName: string): SheetType | null {
  const norm = sheetName.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  for (const sig of SHEET_SIGNATURES) {
    for (const hint of sig.sheetNameHints) {
      const h = hint.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
      if (norm === h) return sig.type;
    }
  }
  return null;
}
