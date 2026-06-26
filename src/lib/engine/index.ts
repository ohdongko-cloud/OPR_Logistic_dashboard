/**
 * 엔진 TRANSFORM 공개 표면.
 *
 * 흐름(아키텍처 §3 · spec):
 *   ingest records ─buildKanban(Stage1)→ KanbanRow[]
 *                  ─buildFactTree/rollup(Stage2)→ FactRow[] (대시보드 동형)
 *
 * 영속화 grain = FactTree.leaves(4키 L5). 조회·뷰 = rows(롤업 포함) 또는 lazy rollup.
 */

export * from "./types";
export * from "./raw-columns";
export * from "./dim-class";
export * from "./logi-cost";
export * from "./stage1-kanban";
export * from "./stage2-aggregate";

import { buildKanban, type EngineInput } from "./stage1-kanban";
import { buildFactTree, type FactTree } from "./stage2-aggregate";
import { type KanbanRow } from "./types";

/** Stage1+Stage2 일괄 실행. */
export function runEngine(input: EngineInput): {
  kanban: KanbanRow[];
  tree: FactTree;
} {
  const kanban = buildKanban(input);
  const tree = buildFactTree(kanban);
  return { kanban, tree };
}
