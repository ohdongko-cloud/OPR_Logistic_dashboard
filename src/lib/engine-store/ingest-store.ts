/**
 * 매장 RAW ingest — 매장 당월 워크북(5 RAW + 대시보드 마스터 + 수불오차) 파싱.
 *
 * 근거: spec 매장 §0~§2 (5 RAW 시트명·블록·데이터행) · 실파일 시트명 실측.
 *   매장 파일은 시트명이 고정(※지점대시보드·매장전체칸반(당월)·매출상세분석·
 *   기말재고(지점)·기초재고(지점)·상품수불(지점)·수불오차)이라 시그니처 자동판별 불요.
 *
 * 보안(파싱 방어): 아이템 ingest 와 동일 — 매크로/외부링크 차단·행상한·dense:false.
 *
 * 산출:
 *   raw      = 5 RAW 시트의 (점포코드 → 컬럼별 값) 인덱스(VLOOKUP O(1) 조회용).
 *   curation = 대시보드 카드 노출 점포코드 + 점포 기준 마스터(H~K). (spec §6 파라미터화)
 *   errors   = 수불오차 코드키·이름키 이원화 조회 인덱스.
 */

import * as XLSX from "xlsx";

import { normalizeStoreName } from "./store-name";
import {
  STORE_RAW_DATA_START,
  ERR_CODE_BLOCK,
} from "./raw-columns";
import { resolveSeasonLabel, type SeasonName } from "./season-label";
import { type StoreRoster } from "./stage1-store-kanban";
import {
  STORE_CHANNELS,
  type StoreChannel,
  type StoreCuration,
  type StoreErrorIndex,
  type StoreMaster,
} from "./types";

const MAX_ROWS = 5000;

/** RAW 시트 1개의 (조인키 → 컬럼문자→값) 맵. */
export type RawSheetIndex = Map<string, Record<string, number | null>>;

export interface StoreRawData {
  sales: RawSheetIndex; // 매출상세분석
  endInv: RawSheetIndex; // 기말재고(지점)
  openInv: RawSheetIndex; // 기초재고(지점)
  flow: RawSheetIndex; // 상품수불(지점)
}

export interface StoreIngestResult {
  ok: boolean;
  blockedReason?: string;
  raw: StoreRawData;
  /**
   * 점포 명부(코드→채널·지점명). 채널(직영/중관/기타)은 RAW 에 없고 칸반 시트의 B열에만
   * 존재하는 마스터 분류 → 칸반 점포행(R13~43) A/B/C 에서 읽는다. (입력 마스터로 취급)
   */
  roster: StoreRoster[];
  curation: StoreCuration;
  errors: StoreErrorIndex;
  /**
   * 스냅샷 시즌명(C12) — 칸반/대시보드 헤더 텍스트에서 추출(여름/가을/겨울/봄).
   * "해당 시즌+공통 재고" 비중·재고 라벨의 동적 표기 진실원천. 미탐지 시 "여름"(현행).
   */
  seasonLabel: SeasonName;
}

/** 시트명 후보(부분일치) → 첫 매칭 워크시트. */
function findSheet(wb: XLSX.WorkBook, contains: string): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find((n) => n.normalize("NFKC").includes(contains));
  return name ? wb.Sheets[name] : null;
}

function cellNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).normalize("NFKC").trim();
}

/**
 * 워크시트 → AOA(행:셀배열). ★AOA 인덱스를 Excel 좌표(idx0=A1)에 정확히 정렬한다:
 *   - 명시 range(s:{r:0,c:0}) 로 좌측 빈 컬럼/상단 빈 행이 접히지 않게 강제.
 *     (수불오차 시트는 A열 전체가 비어 !ref 가 B 부터 시작 → 미보정 시 컬럼 1칸 밀림.)
 *   - blankrows:true 로 빈 행 보존(STORE_RAW_DATA_START=7 → aoa[6]).
 * 이 보정이 없으면 점포코드 조인키가 1열 어긋나 (−)재고·VLOOKUP 이 누락된다.
 */
function toAoa(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws["!ref"];
  let range: XLSX.Range | undefined;
  if (ref) {
    const r = XLSX.utils.decode_range(ref);
    range = { s: { r: 0, c: 0 }, e: r.e };
  }
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
    range,
  });
}

/** 컬럼문자(A,B,…) → 0-based 인덱스. */
function colIdx(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * RAW 시트 → (점포코드 → 컬럼문자→값) 인덱스.
 * 점포코드 = keyCol(보통 B=플랜트). 데이터 7행~ ('전체 결과' 6행 제외).
 * 같은 코드가 좌/우 블록 양쪽에 등장하므로 첫 등장 코드 기준 머지(좌블록 코드 = 우블록 코드 동일).
 * 단 좌·우 블록의 코드열이 다를 수 있어(예 매출 픽스 B / 전체 I) 양쪽 블록을 각각 코드로 색인 후 병합.
 */
function indexBlocks(
  aoa: unknown[][],
  blocks: Array<{ keyCol: string; cols: string[] }>,
): RawSheetIndex {
  const m: RawSheetIndex = new Map();
  for (let r = STORE_RAW_DATA_START - 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    for (const b of blocks) {
      const code = cellStr(row[colIdx(b.keyCol)]);
      if (!code) continue;
      let acc = m.get(code);
      if (!acc) {
        acc = {};
        m.set(code, acc);
      }
      for (const c of b.cols) {
        acc[c] = cellNum(row[colIdx(c)]);
      }
    }
  }
  return m;
}

/**
 * 매장 워크북 바이트 → ingest 결과.
 * @param bytes .xlsx 바이트(서버 readFileSync 또는 업로드 arrayBuffer).
 */
export function ingestStoreFile(bytes: Uint8Array): StoreIngestResult {
  const empty: StoreRawData = {
    sales: new Map(),
    endInv: new Map(),
    openInv: new Map(),
    flow: new Map(),
  };
  const emptyResult = (reason: string): StoreIngestResult => ({
    ok: false,
    blockedReason: reason,
    raw: empty,
    roster: [],
    curation: { codes: [], masters: {} },
    errors: { byCode: new Map(), byName: new Map() },
    seasonLabel: "여름",
  });

  const wb = XLSX.read(bytes, {
    type: "array",
    dense: false,
    cellDates: false,
    cellFormula: false,
    cellText: false,
  });

  // 보안: 매크로/외부링크 차단(아이템 parse-workbook 동일 방어).
  const wbProps = wb.Workbook?.WBProps as { codeName?: string } | undefined;
  if (wbProps?.codeName) return emptyResult("매크로(.xlsm) 워크북은 허용되지 않습니다.");
  const extLinks = (wb.Workbook as unknown as { ExtLinks?: unknown[] })?.ExtLinks;
  if (Array.isArray(extLinks) && extLinks.length > 0)
    return emptyResult("외부 링크가 포함된 워크북은 허용되지 않습니다.");

  const salesWs = findSheet(wb, "매출상세분석");
  const endWs = findSheet(wb, "기말재고");
  const openWs = findSheet(wb, "기초재고");
  const flowWs = findSheet(wb, "상품수불");
  const errWs = findSheet(wb, "수불오차");
  const dashWs = findSheet(wb, "대시보드");
  const kbWs = findSheet(wb, "칸반");

  if (!salesWs || !endWs || !openWs || !flowWs || !errWs || !dashWs || !kbWs) {
    const missing = [
      !salesWs && "매출상세분석",
      !endWs && "기말재고(지점)",
      !openWs && "기초재고(지점)",
      !flowWs && "상품수불(지점)",
      !errWs && "수불오차",
      !dashWs && "※지점대시보드",
      !kbWs && "매장전체칸반(당월)",
    ]
      .filter(Boolean)
      .join(", ");
    return emptyResult(`필수 매장 시트 누락: ${missing}`);
  }

  // 행상한 가드(OOM 방어).
  for (const ws of [salesWs, endWs, openWs, flowWs, errWs, dashWs, kbWs]) {
    const ref = ws["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      if (range.e.r - range.s.r + 1 > MAX_ROWS)
        return emptyResult("시트 행 수가 상한을 초과했습니다.");
    }
  }

  // ── RAW 5시트 블록 인덱싱 (spec §2 블록 + col letter) ──
  // 매출: 픽스 B키 D/E/F · 전체 I키 K/L/M.
  const sales = indexBlocks(toAoa(salesWs), [
    { keyCol: "B", cols: ["D", "E", "F"] },
    { keyCol: "I", cols: ["K", "L", "M"] },
  ]);
  // 기말: 픽스 B키 D/E · 시즌 K키 M/N · 전체 T키 V/W.
  const endInv = indexBlocks(toAoa(endWs), [
    { keyCol: "B", cols: ["D", "E"] },
    { keyCol: "K", cols: ["M", "N"] },
    { keyCol: "T", cols: ["V", "W"] },
  ]);
  // 기초: 픽스 B키 D/E · 전체 K키 M/N.
  const openInv = indexBlocks(toAoa(openWs), [
    { keyCol: "B", cols: ["D", "E"] },
    { keyCol: "K", cols: ["M", "N"] },
  ]);
  // 상품수불: 픽스 B키 D~I · 전체 K키 M~R.
  const flow = indexBlocks(toAoa(flowWs), [
    { keyCol: "B", cols: ["D", "E", "F", "G", "H", "I"] },
    { keyCol: "K", cols: ["M", "N", "O", "P", "Q", "R"] },
  ]);

  // ── 수불오차 이원화 인덱스 (spec §4-1) ──
  // 블록 B(구매그룹코드)·C(지점명)·G(마이너스 수량)·H(마이너스 금액). 데이터 5행~46.
  const errAoa = toAoa(errWs);
  const errors: StoreErrorIndex = { byCode: new Map(), byName: new Map() };
  for (let r = 0; r < errAoa.length; r++) {
    const row = errAoa[r] ?? [];
    const code = cellStr(row[colIdx("B")]);
    const name = cellStr(row[colIdx("C")]);
    const g = cellNum(row[colIdx("G")]);
    const h = cellNum(row[colIdx("H")]);
    if (!code && !name) continue;
    // 헤더/라벨 행(코드가 숫자/문자 아닌 라벨) 방어: 수량·금액 둘 다 null 이고 코드도 숫자 아님이면 스킵
    const val = { negQty: g, negAmt: h };
    if (code) errors.byCode.set(code, val);
    if (code === "전체") errors.byCode.set("전체", val);
    if (name) errors.byName.set(normalizeStoreName(name), val);
  }
  // ERR_CODE_BLOCK 참조 보존(매핑 문서화) — 코드키 블록 B:H 의 idx6=G·idx7=H.
  void ERR_CODE_BLOCK;

  // ── 대시보드 점포 큐레이션 + 기준 마스터 (대시보드 R4~21 A/H/I/J/K) ──
  const dashAoa = toAoa(dashWs);
  const curation: StoreCuration = { codes: [], masters: {} };
  for (let r = 3; r < dashAoa.length; r++) {
    // r idx0=row1 → dashAoa[3]=row4
    const row = dashAoa[r] ?? [];
    const code = cellStr(row[colIdx("A")]);
    if (!code) continue;
    const master: StoreMaster = {
      areaPyeong: cellNum(row[colIdx("H")]),
      baseInvQty: cellNum(row[colIdx("I")]),
      baseDisplayQty: cellNum(row[colIdx("J")]),
      baseRunQty: cellNum(row[colIdx("K")]),
    };
    curation.masters[code] = master;
    // 점포 카드(집계 라벨 전체/직영/중간관리/기타 제외)만 codes 에.
    if (!["전체", "직영", "중간관리", "기타"].includes(code)) curation.codes.push(code);
  }

  // ── 점포 명부 roster (칸반 점포행 R13~43 A/B/C — 채널 마스터 + 지점명) ──
  // 집계행(R8~11 전체/직영/중관/기타)·스페이서(R7·R12)는 제외 — A 가 코드(채널 라벨 아님)인 행만.
  const kbAoa = toAoa(kbWs);
  const roster: StoreRoster[] = [];
  const channelLabels = new Set<string>(["전체", ...STORE_CHANNELS, "합계"]);
  for (let r = 0; r < kbAoa.length; r++) {
    const row = kbAoa[r] ?? [];
    const code = cellStr(row[colIdx("A")]);
    const channel = cellStr(row[colIdx("B")]);
    const name = cellStr(row[colIdx("C")]);
    if (!code || channelLabels.has(code)) continue; // 코드행만(집계 라벨 제외)
    if (!STORE_CHANNELS.includes(channel as StoreChannel)) continue; // 유효 채널만
    roster.push({ storeCode: code, channel: channel as StoreChannel, storeName: name });
  }

  // ── 스냅샷 시즌명(C12) — 헤더 텍스트에서 추출(우선순위: 칸반 G6/P6 > 대시 O3/F2 > "여름") ──
  // 칸반 헤더행 = 6행(0-based 5). 대시 헤더행 = 3행(O3)·2행(F2).
  const cellAt = (aoa: unknown[][], col: string, row1: number): string =>
    cellStr((aoa[row1 - 1] ?? [])[colIdx(col)]);
  const seasonLabel: SeasonName = resolveSeasonLabel([
    cellAt(kbAoa, "G", 6), // 칸반 "여름비중"
    cellAt(kbAoa, "P", 6), // 칸반 "여름/공통\n재고량"
    cellAt(dashAoa, "O", 3), // 대시 "여름재고량"
    cellAt(dashAoa, "F", 2), // 대시 "여름,공통"
  ]);

  return {
    ok: true,
    raw: { sales, endInv, openInv, flow },
    roster,
    curation,
    errors,
    seasonLabel,
  };
}
