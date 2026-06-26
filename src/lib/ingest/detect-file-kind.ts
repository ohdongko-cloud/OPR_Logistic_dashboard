/**
 * 업로드 워크북 → 파일 종류(아이템/매장) + 기간(당월/누적) 자동판별.
 *
 * 근거(실파일 시트셋 실측 2026-06-26):
 *  - 아이템: `물류전체칸반(당월|누적)` + RAW 6 + `물류비 예측`·`#분류`.
 *  - 매장:   `매장전체칸반(당월)` + `수불오차`·`※지점대시보드`·`기말재고(지점)`·`상품수불(지점)`.
 *    ※ 매장 파일도 `매출상세분석`·`기초재고(지점)` 시트를 공유 → 시트명 셋의 매장 고유 마커로 우선 분기.
 *
 * 기간: 칸반 시트명의 `(당월)`/`(누적)` 라벨. 없으면(매장은 당월만) MONTH.
 *
 * 폼 보조: 자동판별이 unknown 이면 사용자가 폼에서 종류를 선택(detectFileKind 결과를 기본값으로).
 *
 * 보안: 시트명만 읽음(셀 본문 미파싱) — 가볍고 안전.
 */

import * as XLSX from "xlsx";

import { type PeriodType } from "@/lib/engine";

export type UploadKind = "item" | "store" | "unknown";

export interface FileKindResult {
  kind: UploadKind;
  /** kind=item|store 일 때 추정 기간. unknown 이면 null. */
  period: PeriodType | null;
  /** 원본 시트명(디버그·UI 표기) */
  sheetNames: string[];
  reason: string;
}

/** 매장 파일을 단정하는 고유 시트 마커(아이템엔 없음). */
const STORE_MARKERS = ["수불오차", "매장전체칸반", "지점대시보드", "기말재고"];
/** 아이템 파일을 단정하는 고유 시트 마커. */
const ITEM_MARKERS = ["물류전체칸반"];

function hasSheetLike(names: string[], marker: string): boolean {
  return names.some((n) => n.normalize("NFKC").includes(marker));
}

/** 칸반 시트명에서 기간 라벨 추출. */
function periodFromNames(names: string[]): PeriodType | null {
  for (const n of names) {
    const nn = n.normalize("NFKC");
    if (nn.includes("칸반")) {
      if (nn.includes("누적")) return "CUMULATIVE";
      if (nn.includes("당월")) return "MONTH";
    }
  }
  return null;
}

/**
 * 워크북 바이트(또는 SheetNames)로 종류·기간 판별.
 * @param bytes .xlsx 바이트
 */
export function detectFileKind(bytes: Uint8Array): FileKindResult {
  let names: string[] = [];
  try {
    // bookSheets:true → 시트명만(본문 미파싱, 가벼움·빠름).
    const wb = XLSX.read(bytes, { type: "array", bookSheets: true });
    names = wb.SheetNames ?? [];
  } catch {
    return { kind: "unknown", period: null, sheetNames: [], reason: "워크북 파싱 실패" };
  }

  const isStore = STORE_MARKERS.some((m) => hasSheetLike(names, m));
  const isItem = ITEM_MARKERS.some((m) => hasSheetLike(names, m));

  // 매장 마커가 있으면 매장 우선(매출상세분석 공유 시트로 인한 오탐 방지).
  if (isStore) {
    return {
      kind: "store",
      period: periodFromNames(names) ?? "MONTH",
      sheetNames: names,
      reason: "매장 고유 시트(수불오차/매장칸반/지점대시보드) 감지",
    };
  }
  if (isItem) {
    return {
      kind: "item",
      period: periodFromNames(names) ?? "MONTH",
      sheetNames: names,
      reason: "아이템 칸반 시트 감지",
    };
  }

  return {
    kind: "unknown",
    period: null,
    sheetNames: names,
    reason: "아이템/매장 고유 시트 미발견 — 수동 선택 필요",
  };
}
