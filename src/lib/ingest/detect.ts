/**
 * 헤더 → RAW SheetType 자동 판별.
 *
 * 근거: 아키텍처 §2-2 "헤더 시그니처(참조앱 detect.ts 패턴)" + 실파일 r1~r6 실측.
 *
 * 전략(시트명 의존 최소화, 헤더 우선 — 참조앱 패턴):
 *  1) r1~r6 헤더행들을 정규화해 하나의 문자열로 합침.
 *  2) 각 시그니처의 required 토큰이 모두 매칭되면 점수 1.0.
 *  3) 재고 4탭(점/물류/기초2)은 측정라벨이 동일 → 헤더만으론 동률.
 *     이때 시트명 힌트(matchByName)로 타이브레이크(원본 시트명이 명확).
 *  4) 헤더·시트명 모두 실패 → type=null (사용자 수동지정 필요).
 */

import { normalizeForSig } from "./normalize";
import {
  matchByName,
  SHEET_SIGNATURES,
  type SheetType,
  type SheetSignature,
} from "./sheet-types";

export interface DetectionResult {
  type: SheetType | null;
  confidence: number; // 0~1
  scores: Partial<Record<SheetType, number>>;
  reason: string;
}

type HeaderCell = string | number | boolean | null | undefined;

/** 헤더행들(2차원)을 정규화 문자열로 병합. */
function joinHeaders(
  headerRows: ReadonlyArray<ReadonlyArray<HeaderCell>>,
): string {
  return headerRows
    .flat()
    .map(normalizeForSig)
    .filter(Boolean)
    .join("|");
}

function scoreSignature(joined: string, sig: SheetSignature): number {
  const matched = sig.required.filter((r) =>
    joined.includes(normalizeForSig(r)),
  ).length;
  return matched / sig.required.length;
}

/**
 * @param headerRows  r1~r6(또는 가용한 상단 헤더행들)의 2차원 셀배열
 * @param sheetName   원본 시트명(타이브레이크 폴백)
 */
export function detectSheetType(
  headerRows: ReadonlyArray<ReadonlyArray<HeaderCell>>,
  sheetName: string,
): DetectionResult {
  const joined = joinHeaders(headerRows);

  const scores: Partial<Record<SheetType, number>> = {};
  for (const sig of SHEET_SIGNATURES) {
    scores[sig.type] = scoreSignature(joined, sig);
  }

  // 1.0 매칭된 시그니처들 수집.
  const perfect = SHEET_SIGNATURES.filter((s) => scores[s.type] === 1);

  // 시트명 힌트 매칭(타이브레이크·폴백).
  const nameMatch = matchByName(sheetName);

  // (a) 헤더 1.0 매칭이 정확히 1개 → 확정.
  if (perfect.length === 1) {
    const t = perfect[0]!.type;
    return {
      type: t,
      confidence: 1,
      scores,
      reason: `header signature 100% match → ${t}`,
    };
  }

  // (b) 헤더 1.0 매칭이 여러 개(재고 4탭 동률) → 시트명으로 타이브레이크.
  if (perfect.length > 1) {
    if (nameMatch && perfect.some((s) => s.type === nameMatch)) {
      return {
        type: nameMatch,
        confidence: 1,
        scores,
        reason: `header tie among [${perfect
          .map((s) => s.type)
          .join(",")}] resolved by sheet name → ${nameMatch}`,
      };
    }
    return {
      type: null,
      confidence: 1,
      scores,
      reason: `ambiguous header tie among [${perfect
        .map((s) => s.type)
        .join(",")}], sheet name '${sheetName}' did not resolve`,
    };
  }

  // (c) 헤더 1.0 매칭 없음 → 시트명 힌트로 폴백.
  if (nameMatch) {
    return {
      type: nameMatch,
      confidence: scores[nameMatch] ?? 0,
      scores,
      reason: `no full header match; resolved by sheet name → ${nameMatch}`,
    };
  }

  // (d) 부분 매칭 중 최고 + 2위와 격차 충분 → 잠정 확정.
  const sorted = (
    Object.entries(scores) as [SheetType, number][]
  ).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0] ?? ["매출상세" as SheetType, 0];
  const secondScore = sorted[1]?.[1] ?? 0;
  if (bestScore >= 0.7 && bestScore - secondScore >= 0.25) {
    return {
      type: bestType,
      confidence: bestScore,
      scores,
      reason: `partial header match ${Math.round(bestScore * 100)}% with clear lead`,
    };
  }

  return {
    type: null,
    confidence: bestScore,
    scores,
    reason: `unrecognized sheet '${sheetName}' (best ${Math.round(bestScore * 100)}%)`,
  };
}
