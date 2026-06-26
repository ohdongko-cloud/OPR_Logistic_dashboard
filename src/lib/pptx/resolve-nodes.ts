/**
 * NodeRef(슬라이드1 행 식별) → 엔진 FactRow 산출.
 *
 * 검증된 엔진(rollup/stage2)을 그대로 호출 → 엑셀 100% 일치 유지(agg-tree와 동일 원칙).
 * 집계를 새로 정의하지 않는다.
 */

import {
  isClassified,
  rollup,
  seasonGroup,
  type FactRow,
  type KanbanRow,
} from "@/lib/engine";
import type { NodeRef } from "./slide1-map";

/** NodeRef 술어 — 성별·신상이월·SS/FW 그룹 조건의 AND. 비어있는 조건은 무시(전체). */
function predicateFor(ref: NodeRef): (k: KanbanRow) => boolean {
  return (k) =>
    (!ref.gender || k.gender === ref.gender) &&
    (!ref.newcarry || k.newcarry === ref.newcarry) &&
    (!ref.ssfw || seasonGroup(k.season) === ref.ssfw);
}

/** 한 NodeRef 의 집계 FactRow(검증된 rollup 경유). */
export function resolveNode(kanban: KanbanRow[], ref: NodeRef): FactRow {
  const classified = kanban.filter(isClassified);
  const key = {
    gender: ref.gender,
    newcarry: ref.newcarry,
    season: ref.ssfw ? `${ref.ssfw}시즌` : "",
    item: "",
  };
  return rollup(classified, key, ref.level, predicateFor(ref));
}
