/**
 * Stage1 — 매장 RAW → 매장전체칸반 점포 리프행 재구성.
 *
 * 근거: spec 매장 §1(조인 메커니즘)·§3(3단 매핑 표 col_index)·§4(파생 가드) + 실파일 수식 실측.
 *
 * 단계:
 *  1) 점포 유니버스 = 4 RAW(매출·기말·기초·상품수불) 픽스블록 코드(B) 합집합.
 *     채널·지점명은 (없으면) 다른 RAW 또는 칸반 부재 → ingest 가 RAW C열을 직접 줄 수 없어
 *     상품수불/매출 RAW 의 지점명을 함께 색인하면 좋으나, 채널(직영/중관/기타)은 RAW 에 없다.
 *     → 채널·지점명은 **칸반 시트(원본)에서 점포코드와 함께 제공**받는다(input.roster).
 *  2) 각 점포: 35열 = VLOOKUP(점포코드, 블록, col_index) (정확매칭, IFERROR → null).
 *  3) 파생열(D·E·F·G·O·V·AD·AI) 행단위 연산(IFERROR(분자/분모,"") = denom 0 → null).
 *
 * ★col_index = 블록 시작열 기준 상대 인덱스(spec §2 — 라벨 아닌 col_index 우선).
 */

import { type RawSheetIndex, type StoreRawData } from "./ingest-store";
import { blockCol } from "./raw-columns";
import {
  type StoreChannel,
  type StoreKanbanRow,
  type StoreParams,
} from "./types";

/** 점포 명부(코드→채널·지점명) — 칸반 원본 A/B/C 또는 RAW C열 보강. */
export interface StoreRoster {
  storeCode: string;
  channel: StoreChannel;
  storeName: string;
}

export interface StoreKanbanInput {
  raw: StoreRawData;
  params: StoreParams;
  /** 점포 명부(채널·지점명). 미제공 시 RAW 매출/수불의 지점명 + 채널=기타 폴백. */
  roster?: StoreRoster[];
}

/** IFERROR(분자/분모,"") → null(분모0=공란). */
function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/** VLOOKUP(코드, 블록, col_index) — RawSheetIndex 에서 blockCol 로 절대열 산출 후 조회. */
function vlookup(
  idx: RawSheetIndex,
  code: string,
  blockStart: string,
  colIndex: number,
): number {
  const rec = idx.get(code);
  if (!rec) return 0; // IFERROR → "" 인데 데이터열은 0 적재(검증: 공란=0/null 양쪽 허용)
  const letter = blockCol(blockStart, colIndex);
  return rec[letter] ?? 0;
}

/**
 * 점포 유니버스 + 채널·지점명 — roster 우선, 없으면 RAW 픽스블록 코드 + 지점명(매출 C / 수불 C는
 * indexBlocks 가 측정값만 색인하므로 roster 가 정답원). roster 없으면 채널 미상('기타').
 */
function collectStores(input: StoreKanbanInput): StoreRoster[] {
  if (input.roster && input.roster.length) return input.roster;
  // 폴백: 4 RAW 픽스블록 코드 합집합(채널 미상 → '기타', 지점명 빈값).
  const codes = new Set<string>();
  for (const idx of [input.raw.sales, input.raw.endInv, input.raw.openInv, input.raw.flow]) {
    for (const code of idx.keys()) codes.add(code);
  }
  return [...codes].map((storeCode) => ({
    storeCode,
    channel: "기타" as StoreChannel,
    storeName: "",
  }));
}

/** Stage1 메인 — RAW → StoreKanbanRow[](점포 리프). */
export function buildStoreKanban(input: StoreKanbanInput): StoreKanbanRow[] {
  const { raw, params } = input;
  const { sales, endInv, openInv, flow } = raw;
  const C1 = params.workDays;
  const stores = collectStores(input);

  return stores.map((s) => {
    const code = s.storeCode;

    // ── 픽스블록(H~V) ──
    // 상품수불 픽스 B:I — H idx6=G(점간입고량), I idx5=F(점간입고액), J idx8=I, K idx7=H.
    const inQtyFix = vlookup(flow, code, "B", 6);
    const inAmtFix = vlookup(flow, code, "B", 5);
    const retQtyFix = vlookup(flow, code, "B", 8);
    const retAmtFix = vlookup(flow, code, "B", 7);
    // 매출 픽스 B:F — L idx5=F(판매수량), M idx3=D(실매출액), N idx4=E(총매출원가).
    const saleQtyFix = vlookup(sales, code, "B", 5);
    const saleAmtFix = vlookup(sales, code, "B", 3);
    const cogsFix = vlookup(sales, code, "B", 4);
    const dailyCogsFix = safeDiv(cogsFix, C1); // O = N/C1
    // 기말 픽스시즌+공통 K:N — P idx3=M(재고량), Q idx4=N(재고액).
    const summerInvQty = vlookup(endInv, code, "K", 3);
    const summerInvAmt = vlookup(endInv, code, "K", 4);
    // 기말 픽스 B:E — R idx3=D(재고량), S idx4=E(재고액).
    const invQtyFix = vlookup(endInv, code, "B", 3);
    const invAmtFix = vlookup(endInv, code, "B", 4);
    // 기초 픽스 B:E — T idx3=D, U idx4=E.
    const openQtyFix = vlookup(openInv, code, "B", 3);
    const openAmtFix = vlookup(openInv, code, "B", 4);
    const avgInvFix = safeDiv(invAmtFix + openAmtFix, 2); // V = (S+U)/2

    // ── 전체블록(W~AI) ──
    // 상품수불 전체 K:R — W idx6=P, X idx5=O, Y idx8=R, Z idx7=Q.
    const inQtyAll = vlookup(flow, code, "K", 6);
    const inAmtAll = vlookup(flow, code, "K", 5);
    const retQtyAll = vlookup(flow, code, "K", 8);
    const retAmtAll = vlookup(flow, code, "K", 7);
    // 매출 전체 I:M — AA idx5=M(판매수량), AB idx3=K(실매출액), AC idx4=L(총매출원가).
    const saleQtyAll = vlookup(sales, code, "I", 5);
    const saleAmtAll = vlookup(sales, code, "I", 3);
    const cogsAll = vlookup(sales, code, "I", 4);
    const dailyCogsAll = safeDiv(cogsAll, C1); // AD = AC/C1
    // 기말 전체 T:W — AE idx3=V(재고량), AF idx4=W(재고액).
    const invQtyAll = vlookup(endInv, code, "T", 3);
    const invAmtAll = vlookup(endInv, code, "T", 4);
    // 기초 전체 K:N — AG idx3=M, AH idx4=N.
    const openQtyAll = vlookup(openInv, code, "K", 3);
    const openAmtAll = vlookup(openInv, code, "K", 4);
    const avgInvAll = safeDiv(invAmtAll + openAmtAll, 2); // AI = (AF+AH)/2

    // ── KPI(D~G) 파생 ──
    const saleMult = safeDiv(saleQtyAll, inQtyAll); // D = AA/W
    const dotsFix = dailyCogsFix === null ? null : safeDiv(avgInvFix ?? 0, dailyCogsFix); // E = V/O
    const dotsAll = dailyCogsAll === null ? null : safeDiv(avgInvAll ?? 0, dailyCogsAll); // F = AI/AD
    const summerPct = safeDiv(summerInvAmt, invAmtFix); // G = Q/S

    return {
      storeCode: code,
      channel: s.channel,
      storeName: s.storeName,
      saleMult,
      dotsFix,
      dotsAll,
      summerPct,
      inQtyFix,
      inAmtFix,
      retQtyFix,
      retAmtFix,
      saleQtyFix,
      saleAmtFix,
      cogsFix,
      dailyCogsFix,
      summerInvQty,
      summerInvAmt,
      invQtyFix,
      invAmtFix,
      openQtyFix,
      openAmtFix,
      avgInvFix,
      inQtyAll,
      inAmtAll,
      retQtyAll,
      retAmtAll,
      saleQtyAll,
      saleAmtAll,
      cogsAll,
      dailyCogsAll,
      invQtyAll,
      invAmtAll,
      openQtyAll,
      openAmtAll,
      avgInvAll,
    };
  });
}
