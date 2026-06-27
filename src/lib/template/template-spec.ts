/**
 * 업로드 양식 템플릿 사양 — 파일종류별(아이템/매장) 시트·열위치·헤더 단일 진실원.
 *
 * ★출처(파서가 실제로 읽는 좌표) — 임의 값 금지:
 *  - 아이템 RAW: `src/lib/ingest/sheet-types.ts`(헤더 시그니처 r1/r4/r5)
 *    + `src/lib/engine/raw-columns.ts`(MEASURE_COLUMNS·DIM_COLUMNS 열 letter)
 *    + `02_파일분석/엔진_transform_spec.md` §2(시트별 측정/분류 열).
 *  - 매장 RAW: `src/lib/engine-store/ingest-store.ts`(indexBlocks 블록 키·열)
 *    + `src/lib/engine-store/raw-columns.ts`(블록 시작열)
 *    + `02_파일분석/엔진_transform_spec_매장.md` §2(블록 B:F/I:M 등).
 *
 * 목적: 업로더가 "어느 시트·어느 열에 무슨 값"을 넣는지 헷갈리지 않도록 헤더를
 *   **정확한 열 위치**에 박은 .xlsx 를 생성한다. 데이터행은 비우고(예시 1행만 회색 안내),
 *   맨 앞 README 시트에 시트별·핵심열별 의미·주의를 한국어로 적는다.
 *
 * 보안: 실데이터 0(헤더·안내·예시 더미만). SAP 추출 형식의 컬럼 라벨은 비민감.
 */

/** 한 열의 헤더 정의 — 정확한 엑셀 열 letter 에 박는다. */
export interface TemplateColumn {
  /** 엑셀 열 letter(A,B,…,AA…). 파서 기대 좌표. */
  col: string;
  /** 헤더 텍스트(한국어 — 업로더가 보는 라벨). */
  header: string;
  /** 예시 더미값(회색 안내행 1줄). 실데이터 아님. */
  example?: string | number;
  /** 핵심열 여부(README 강조 + 안내 주석). */
  key?: boolean;
  /** 이 열의 의미·주의(README 표기용). */
  note?: string;
}

/** 한 시트(탭)의 템플릿 정의. */
export interface TemplateSheet {
  /** 시트명(파서가 헤더 시그니처/이름으로 찾는 탭명). */
  name: string;
  /** 사람용 설명(README). */
  desc: string;
  /**
   * 헤더를 배치할 행(1-based). 아이템 RAW = 4행(측정 라벨행, 파서 시그니처+데이터 7행 직전 라벨).
   * 매장 RAW = 4행(라벨행, 데이터 7행). 마스터(분류·물류비예측)는 1행.
   */
  headerRow: number;
  /**
   * 파서 시그니처/안내용 상단 보조행 — {행번호(1-based) → {열letter→텍스트}}.
   * 아이템 RAW 는 r1(리포트명)·r5(차원라벨)을 박아 detectSheetType 통과를 보장.
   */
  topRows?: Record<number, Record<string, string>>;
  /** 데이터 시작행(1-based) — 예시 안내행을 여기에 1줄. */
  dataStartRow: number;
  columns: TemplateColumn[];
}

export type TemplateKind = "item" | "store";

export interface TemplateDef {
  kind: TemplateKind;
  title: string;
  /** 업로드 페이지 안내. */
  guide: string;
  sheets: TemplateSheet[];
}

/**
 * ── 아이템 템플릿 ──
 * 6 RAW 시트(매출상세분석·점재고·물류재고·센터입출고·기초재고(지점)·기초재고(센터)).
 * 공통 RAW 레이아웃(엔진_transform_spec §2 · sheet-types §):
 *   r1 = 리포트명(시그니처 식별) · r4 = 측정 라벨행(헤더) · r5 = 차원 라벨행 · r6 = "전체 결과"(합계, 스킵) · r7~ = 데이터.
 *   A열 = 조인키(계절연도-MC자재그룹 = SKU키) · F열 = 구매그룹(상품축 조인키).
 *
 * 각 시트 columns 는 파서가 실제로 읽는 열만 헤더 고정(나머지 빈칸 허용).
 * MEASURE_COLUMNS·DIM_COLUMNS(raw-columns.ts)와 1:1.
 */
export const ITEM_TEMPLATE: TemplateDef = {
  kind: "item",
  title: "OPR 물류 모니터링 — 아이템 업로드 양식",
  guide:
    "SAP/BI 에서 추출한 아이템 RAW 6시트를 이 양식의 열 위치 그대로 채워 업로드하세요. " +
    "A열(계절연도-자재그룹=SKU키)·F열(구매그룹)은 모든 시트 공통 조인키입니다. " +
    "데이터는 7행부터 입력하고, 6행(전체 결과 합계행)은 비우거나 그대로 두세요.",
  sheets: [
    {
      name: "매출상세분석",
      desc: "SAP 매출 RAW. 칸반이 SUMIF(A=SKU)로 매출·원가·판매수량을 끌어옵니다.",
      headerRow: 4,
      topRows: {
        1: { A: "매출상세분석" }, // r1 리포트명 — detectSheetType 시그니처
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)", O: "대구분", R: "대분류", T: "시즌", U: "구분(신상/이월)" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키. 형식 = 계절연도-MC자재그룹." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "E", header: "품명", example: "(품명)" },
        { col: "F", header: "구매그룹(상품)", example: "BKC", key: true, note: "상품(브랜드축) 조인키. 3자 코드." },
        { col: "H", header: "실매출액", example: 0, note: "측정값. SUMIF 합산." },
        { col: "I", header: "총매출원가", example: 0 },
        { col: "J", header: "판매수량", example: 0 },
        { col: "O", header: "대구분(성별)", example: "여성", note: "분류차원. 여성/남성/아동/골드여성/골드남성." },
        { col: "R", header: "대분류(아이템)", example: "상의" },
        { col: "T", header: "시즌", example: "여름", note: "봄/여름/가을/겨울/공통." },
        { col: "U", header: "구분(신상/이월)", example: "신상" },
      ],
    },
    {
      name: "점재고",
      desc: "SAP 매장 일재고 RAW. 재고량/재고액/체화량/체화액(점포).",
      headerRow: 4,
      topRows: {
        1: { A: "일재고분석" },
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)", Q: "대구분", T: "대분류", V: "시즌", W: "구분" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "F", header: "구매그룹(상품)", example: "BKC", key: true },
        { col: "H", header: "재고량", example: 0, note: "측정값." },
        { col: "I", header: "재고액(V-,원가)", example: 0 },
        { col: "X", header: "체화량", example: 0 },
        { col: "Y", header: "체화액", example: 0 },
        { col: "Q", header: "대구분(성별)", example: "여성" },
        { col: "T", header: "대분류(아이템)", example: "상의" },
        { col: "V", header: "시즌", example: "여름" },
        { col: "W", header: "구분(신상/이월)", example: "신상" },
      ],
    },
    {
      name: "물류재고",
      desc: "SAP 센터 일재고 RAW. 재고량/재고액/체화량/체화액(센터).",
      headerRow: 4,
      topRows: {
        1: { A: "일재고분석" },
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)", Q: "대구분", T: "대분류", V: "시즌", W: "구분" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "F", header: "구매그룹(상품)", example: "BKC", key: true },
        { col: "H", header: "재고량", example: 0, note: "측정값(상품 재고량 원천)." },
        { col: "I", header: "재고액(V-,원가)", example: 0 },
        { col: "X", header: "체화량", example: 0 },
        { col: "Y", header: "체화액", example: 0 },
        { col: "Q", header: "대구분(성별)", example: "여성" },
        { col: "T", header: "대분류(아이템)", example: "상의" },
        { col: "V", header: "시즌", example: "여름" },
        { col: "W", header: "구분(신상/이월)", example: "신상" },
      ],
    },
    {
      name: "센터입출고",
      desc: "SAP 일상품수불장 RAW. ⚠ H=금액 / I=수량 (재고시트와 역전).",
      headerRow: 4,
      topRows: {
        1: { A: "일상품수불장" },
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)", R: "대구분", U: "대분류", W: "시즌", X: "구분" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "F", header: "구매그룹(상품)", example: "BKC", key: true },
        { col: "H", header: "벤더입고액", example: 0, key: true, note: "⚠ H=금액(I=수량과 역전)." },
        { col: "I", header: "벤더입고량", example: 0, key: true, note: "⚠ I=수량." },
        { col: "J", header: "점간입고액", example: 0 },
        { col: "K", header: "점간입고량", example: 0 },
        { col: "L", header: "점간출고액", example: 0 },
        { col: "M", header: "점간출고량", example: 0 },
        { col: "R", header: "대구분(성별)", example: "여성" },
        { col: "U", header: "대분류(아이템)", example: "상의" },
        { col: "W", header: "시즌", example: "여름" },
        { col: "X", header: "구분(신상/이월)", example: "신상" },
      ],
    },
    {
      name: "기초재고(지점)",
      desc: "SAP 지점 월초재고 RAW. I=재고액(기초·지점).",
      headerRow: 4,
      topRows: {
        1: { A: "일재고분석" },
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "F", header: "구매그룹(상품)", example: "BKC" },
        { col: "H", header: "재고량", example: 0 },
        { col: "I", header: "재고액(V-,원가)", example: 0, key: true, note: "기초(지점) 재고액 원천." },
      ],
    },
    {
      name: "기초재고(센터)",
      desc: "SAP 센터 월초재고 RAW. I=재고액(기초·센터).",
      headerRow: 4,
      topRows: {
        1: { A: "일재고분석" },
        5: { A: "계절연도+계절(Now)", D: "MC(자재그룹)(Now)" },
      },
      dataStartRow: 7,
      columns: [
        { col: "A", header: "계절연도-자재그룹(SKU키)", example: "20192-BKCBA1", key: true, note: "조인키." },
        { col: "C", header: "계절연도", example: "20192" },
        { col: "D", header: "MC(자재그룹)", example: "BKCBA1" },
        { col: "F", header: "구매그룹(상품)", example: "BKC" },
        { col: "H", header: "재고량", example: 0 },
        { col: "I", header: "재고액(V-,원가)", example: 0, key: true, note: "기초(센터) 재고액 원천." },
      ],
    },
  ],
};

/**
 * ── 매장 템플릿 ──
 * 5 RAW 시트(매출상세분석·기말재고·기초재고·상품수불·수불오차).
 * 매장 RAW 레이아웃(엔진_transform_spec_매장 §2 · ingest-store indexBlocks):
 *   r1 = 블록명 · r4 = 측정 라벨행(헤더) · r6 = "전체 결과"(스킵) · r7~ = 점포 데이터.
 *   조인키 = B열(플랜트=점포코드), C열=지점명. 수불오차만 B=구매그룹코드·C=지점명.
 *   좌(픽스)/우(전체) **다중 블록**이 같은 시트에 가로 병렬.
 */
export const STORE_TEMPLATE: TemplateDef = {
  kind: "store",
  title: "OPR 물류 모니터링 — 매장(당월) 업로드 양식",
  guide:
    "SAP/BI 에서 추출한 매장 RAW 5시트를 이 양식의 열 위치 그대로 채워 업로드하세요. " +
    "B열(점포코드=플랜트)이 조인키이며, 같은 시트에 픽스(좌)·전체(우) 블록이 가로로 병렬입니다. " +
    "데이터는 7행부터(수불오차는 5행부터) 입력하세요.",
  sheets: [
    {
      name: "매출상세분석",
      desc: "픽스블록 B:F / 전체블록 I:M. 점포 단위 매출·원가·판매수량.",
      headerRow: 4,
      topRows: { 1: { B: "픽스", I: "전체" } },
      dataStartRow: 7,
      columns: [
        { col: "B", header: "점포코드(픽스블록 키)", example: "7204", key: true, note: "조인키=플랜트. 픽스블록 시작열." },
        { col: "C", header: "지점명", example: "00점" },
        { col: "D", header: "실매출액(픽스)", example: 0 },
        { col: "E", header: "총매출원가(픽스)", example: 0 },
        { col: "F", header: "판매수량(픽스)", example: 0 },
        { col: "I", header: "점포코드(전체블록 키)", example: "7204", key: true, note: "전체블록 시작열(픽스와 동일 코드)." },
        { col: "K", header: "실매출액(전체)", example: 0 },
        { col: "L", header: "총매출원가(전체)", example: 0 },
        { col: "M", header: "판매수량(전체)", example: 0 },
      ],
    },
    {
      name: "기말재고(지점)",
      desc: "픽스 B:E / 여름·공통 K:N / 전체 T:W. 점포 기말 재고량·재고액.",
      headerRow: 4,
      topRows: { 1: { B: "픽스", K: "여름+공통", T: "전체" } },
      dataStartRow: 7,
      columns: [
        { col: "B", header: "점포코드(픽스블록 키)", example: "7204", key: true },
        { col: "C", header: "지점명", example: "00점" },
        { col: "D", header: "재고량(픽스)", example: 0 },
        { col: "E", header: "재고액(픽스, V-원가)", example: 0 },
        { col: "K", header: "점포코드(여름·공통 키)", example: "7204", key: true },
        { col: "M", header: "재고량(여름·공통)", example: 0 },
        { col: "N", header: "재고액(여름·공통)", example: 0 },
        { col: "T", header: "점포코드(전체블록 키)", example: "7204", key: true },
        { col: "V", header: "재고량(전체)", example: 0 },
        { col: "W", header: "재고액(전체)", example: 0 },
      ],
    },
    {
      name: "기초재고(지점)",
      desc: "픽스 B:E / 전체 K:N. 점포 기초(월초) 재고량·재고액.",
      headerRow: 4,
      topRows: { 1: { B: "픽스", K: "전체" } },
      dataStartRow: 7,
      columns: [
        { col: "B", header: "점포코드(픽스블록 키)", example: "7204", key: true },
        { col: "C", header: "지점명", example: "00점" },
        { col: "D", header: "재고량(픽스)", example: 0 },
        { col: "E", header: "재고액(픽스)", example: 0 },
        { col: "K", header: "점포코드(전체블록 키)", example: "7204", key: true },
        { col: "M", header: "재고량(전체)", example: 0 },
        { col: "N", header: "재고액(전체)", example: 0 },
      ],
    },
    {
      name: "상품수불(지점)",
      desc: "픽스 B:I / 전체 K:R. 점포 입고·반품·점간 수불. ⚠ col_index 순서 주의(spec §3).",
      headerRow: 4,
      topRows: { 1: { B: "픽스", K: "전체" } },
      dataStartRow: 7,
      columns: [
        { col: "B", header: "점포코드(픽스블록 키)", example: "7204", key: true },
        { col: "C", header: "지점명", example: "00점" },
        { col: "D", header: "벤더입고액(픽스)", example: 0 },
        { col: "E", header: "벤더입고량(픽스)", example: 0 },
        { col: "F", header: "점간입고액(픽스)", example: 0 },
        { col: "G", header: "점간입고량(픽스)", example: 0 },
        { col: "H", header: "점간출고액(픽스)", example: 0 },
        { col: "I", header: "점간출고량(픽스)", example: 0 },
        { col: "K", header: "점포코드(전체블록 키)", example: "7204", key: true },
        { col: "M", header: "벤더입고액(전체)", example: 0 },
        { col: "N", header: "벤더입고량(전체)", example: 0 },
        { col: "O", header: "점간입고액(전체)", example: 0 },
        { col: "P", header: "점간입고량(전체)", example: 0 },
        { col: "Q", header: "점간출고액(전체)", example: 0 },
        { col: "R", header: "점간출고량(전체)", example: 0 },
      ],
    },
    {
      name: "수불오차",
      desc: "(−)마이너스재고 원천. B=구매그룹코드 / C=지점명 / G=마이너스 수량 / H=마이너스 금액. 데이터 5행부터.",
      headerRow: 4,
      topRows: {},
      dataStartRow: 5,
      columns: [
        { col: "B", header: "구매그룹코드(집계 키)", example: "전체", key: true, note: "집계행 조회 키." },
        { col: "C", header: "지점명(점포 키)", example: "00점", key: true, note: "점포행 조회 키(정규화 필요)." },
        { col: "D", header: "구매그룹수", example: 0 },
        { col: "E", header: "브랜드수", example: 0 },
        { col: "F", header: "잔여재고", example: 0 },
        { col: "G", header: "(−)마이너스재고 수량", example: 0, key: true, note: "음수 직접 적재." },
        { col: "H", header: "(−)마이너스재고 금액", example: 0, key: true, note: "음수 직접 적재." },
      ],
    },
  ],
};

export const TEMPLATES: Record<TemplateKind, TemplateDef> = {
  item: ITEM_TEMPLATE,
  store: STORE_TEMPLATE,
};

/** kind 별 템플릿 가져오기(미지원이면 null). */
export function getTemplateDef(kind: string): TemplateDef | null {
  if (kind === "item") return ITEM_TEMPLATE;
  if (kind === "store") return STORE_TEMPLATE;
  return null;
}
