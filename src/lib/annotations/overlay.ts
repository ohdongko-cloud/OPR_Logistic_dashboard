/**
 * Annotation 오버레이 — 주석 목록을 노드 키별로 색인해 트리/KPI 에 병합.
 *
 * 출력면(엔진 집계)은 불변. 주석(목표·전년수기·비고·조치)을 **별도 레이어**로 겹쳐,
 * 화면이 노드 키로 O(1) 조회한다(아키텍처 §5-2 "Annotation 트리 병합").
 *
 * 노드 1개 오버레이:
 *   - targets[metric]         : 목표값(수기)
 *   - priorYearManual[metric] : 전년 수기값(이력 없을 때 수기 우선)
 *   - remark / action         : 비고·조치 본문(최신 1건)
 */

import { type FactKey } from "@/lib/engine";

import { annotationKeyOf, serializeNodeKey } from "./node-key";
import { type AnnotationDto } from "./types";

/** 노드 1개의 주석 오버레이. */
export interface NodeOverlay {
  /** 지표코드 → 목표값(수기). */
  targets: Record<string, number>;
  /** 지표코드 → 전년 수기값(이력 자동값보다 우선). */
  priorYearManual: Record<string, number>;
  /** 비고(REMARK) 최신 본문. */
  remark?: string;
  /** 조치(ACTION) 최신 본문. */
  action?: string;
}

/** 노드 키 문자열 → NodeOverlay 맵. */
export type AnnotationOverlay = Map<string, NodeOverlay>;

function emptyOverlay(): NodeOverlay {
  return { targets: {}, priorYearManual: {} };
}

/** 주석 목록 → 노드별 오버레이 맵(노드 키 직렬화로 색인). */
export function buildAnnotationOverlay(
  annotations: AnnotationDto[],
): AnnotationOverlay {
  const map: AnnotationOverlay = new Map();
  // 같은 (노드,kind,metric)에 여러 건이면 updatedAt 최신 우선.
  const sorted = [...annotations].sort((a, b) =>
    a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0,
  );

  for (const a of sorted) {
    const nodeKey = serializeNodeKey(annotationKeyOf(a));
    let ov = map.get(nodeKey);
    if (!ov) {
      ov = emptyOverlay();
      map.set(nodeKey, ov);
    }
    switch (a.kind) {
      case "TARGET":
        if (a.metricCode && a.numValue != null) ov.targets[a.metricCode] = a.numValue;
        break;
      case "PRIOR_YEAR":
        if (a.metricCode && a.numValue != null)
          ov.priorYearManual[a.metricCode] = a.numValue;
        break;
      case "REMARK":
        if (a.textValue) ov.remark = a.textValue; // 최신(정렬상 마지막) 우선
        break;
      case "ACTION":
        if (a.textValue) ov.action = a.textValue;
        break;
      // LOGI_COST 는 물류비예측 입력원 — 오버레이 표시 대상 아님(엔진 입력).
      default:
        break;
    }
  }
  return map;
}

const EMPTY: NodeOverlay = emptyOverlay();

/** 노드 키로 오버레이 조회(없으면 빈 오버레이 — 안전). */
export function nodeOverlayFor(
  overlay: AnnotationOverlay,
  node: Partial<FactKey>,
): NodeOverlay {
  const key = serializeNodeKey({
    gender: node.gender ?? "",
    newcarry: node.newcarry ?? "",
    season: node.season ?? "",
    item: node.item ?? "",
  });
  return overlay.get(key) ?? EMPTY;
}
