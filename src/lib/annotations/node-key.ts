/**
 * Annotation 노드 키 — 트리 노드 ↔ Annotation grain(4키) 매핑.
 *
 * DB Annotation 의 gender/newcarry/season/item 은 nullable (NULL = 전사 루트).
 * 트리(엔진)의 FactKey 는 빈문자열("")로 미지정을 표현 → 둘을 정규화해 매칭한다.
 *
 * 단일 진실원: 노드 키 직렬화는 이 모듈만 사용(다른 곳에서 join 금지).
 */

import { type FactKey } from "@/lib/engine";

import { ROOT_NODE_KEY, type NodeKey } from "./types";

/** 부분 키(트리 노드.key) → 정규 4키(빈 슬롯 = ""). */
export function nodeKeyOf(partial: Partial<FactKey>): NodeKey {
  return {
    gender: partial.gender ?? "",
    newcarry: partial.newcarry ?? "",
    season: partial.season ?? "",
    item: partial.item ?? "",
  };
}

/** 4키 → 안정 문자열(React key·맵 키). 전사 루트는 "ROOT". */
export function serializeNodeKey(key: NodeKey): string {
  if (
    key.gender === "" &&
    key.newcarry === "" &&
    key.season === "" &&
    key.item === ""
  ) {
    return "ROOT";
  }
  return [key.gender, key.newcarry, key.season, key.item].join("|");
}

/** DB Annotation 의 nullable 키. */
export interface AnnotationKeyCols {
  gender: string | null;
  newcarry: string | null;
  season: string | null;
  item: string | null;
}

/** DB Annotation 행(NULL=빈)을 정규 4키로. */
export function annotationKeyOf(cols: AnnotationKeyCols): NodeKey {
  return {
    gender: cols.gender ?? "",
    newcarry: cols.newcarry ?? "",
    season: cols.season ?? "",
    item: cols.item ?? "",
  };
}

/** Annotation 행이 특정 노드 키에 정확히 매칭되는가(NULL=빈 동치). */
export function annotationMatchesNode(
  cols: AnnotationKeyCols,
  node: Partial<FactKey>,
): boolean {
  const a = annotationKeyOf(cols);
  const n = nodeKeyOf(node);
  return (
    a.gender === n.gender &&
    a.newcarry === n.newcarry &&
    a.season === n.season &&
    a.item === n.item
  );
}

/** 노드 키 → DB 저장용 nullable 컬럼(빈문자열 → NULL, 인덱스·전사 일관). */
export function nodeKeyToDbCols(key: NodeKey): AnnotationKeyCols {
  return {
    gender: key.gender || null,
    newcarry: key.newcarry || null,
    season: key.season || null,
    item: key.item || null,
  };
}

export { ROOT_NODE_KEY };
