/**
 * 매장(점포) 엔진 공개 표면.
 *
 * 흐름(spec 매장 §0):
 *   ingestStoreFile(bytes) ─→ { raw, roster, curation, errors }
 *   buildStoreKanban({raw,params,roster}) ─Stage1→ StoreKanbanRow[](점포 리프 35열)
 *   buildStoreDashboard(kanban,{params,curation,errors}) ─Stage2→ { root(3단 트리), flatRows(대시보드 행) }
 *
 * 검증: store-engine-realfile.test 가 엑셀 칸반·지점대시보드 캐시값과 셀단위 100% 대조.
 */

export * from "./types";
export * from "./raw-columns";
export * from "./store-name";
export * from "./ingest-store";
export * from "./stage1-store-kanban";
export * from "./stage2-store-tree";
export * from "./agg-store-tree";
export * from "./agg-store-columns";
export * from "./ratio-guard";
