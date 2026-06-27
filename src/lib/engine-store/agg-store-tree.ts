/**
 * 매장 드릴다운 트리(API 응답형) — 전체→채널→점포 3단 + 채널 필터.
 *
 * 근거: spec 매장 §5(3단 계층) · 아이템 agg-tree 의 TreeNode 계약과 호환 형태.
 *
 * buildStoreDashboard 가 이미 검증된 3단 트리(root)+대시보드 행(flatRows)을 산출한다.
 * 이 모듈은 그 위에 **표시 지표(StoreNodeMetrics) + 직렬화 안전 노드**를 입힌다.
 *   - 노드 metrics = 칸반 집계(데이터·파생) + 대시보드 행의 (−)재고·재고보유율(있으면).
 *   - 점포 리프 metrics = 대시보드 카드 행(행별 분기 반영)이 있으면 그걸, 없으면 칸반.
 *   - 채널 필터 = 그 채널만 진입(루트 라벨에 반영) — 아이템 "진입점 점프"와 동일.
 */

import {
  flattenStoreTree,
  type StoreDashboard,
  type StoreTreeNode,
} from "./stage2-store-tree";
import {
  type StoreChannel,
  type StoreDashRow,
  type StoreKanbanRow,
  type StoreLevel,
} from "./types";

/** 매장 트리 노드의 표시 지표(칸반 + 대시보드 분기 병합). */
export interface StoreNodeMetrics {
  // 칸반 KPI/측정(데이터·파생) — 칸반 letter 주석.
  saleMult: number | null; // D 판매배수
  dotsFix: number | null; // E 픽스 재고일수
  dotsAll: number | null; // F 전체 재고일수
  summerPct: number | null; // G 여름비중
  inQtyFix: number; // H 입고량(픽스)
  saleQtyFix: number; // L 판매량(픽스)
  cogsFix: number; // N 매출원가(픽스)
  summerInvQty: number; // P 여름/공통 재고량
  invQtyFix: number; // R 재고량(픽스)
  invAmtFix: number; // S 재고액(픽스)
  inQtyAll: number; // W 입고량(전체)
  saleQtyAll: number; // AA 판매량(전체)
  invQtyAll: number; // AE 기말재고량(전체)
  invAmtAll: number; // AF 기말재고액(전체)

  // 대시보드 분기 지표(행별) — 집계/점포 분기 반영(spec §6).
  dotsDays: number | null; // E 대시 재고일수(분기)
  seasonPct: number | null; // F 시즌비중(분기)
  stockRatio: number | null; // G 재고보유율(분기)
  negQty: number | null; // V (−)재고 수량
  negAmt: number | null; // W (−)재고 금액
  areaPyeong: number | null; // H 운영평수
  baseInvQty: number | null; // I 기준재고량

  // 비율 가드용 carry 분모(행종류 분기 실분모 — 희소판정 정확성).
  dotsDaysDenom: number | null; // E 재고일수 실분모(일평균원가, 금액)
  seasonPctDenom: number | null; // F 시즌비중 실분모(재고량, 수량)
}

/** 직렬화 안전 트리 노드(아이템 TreeNode 계약 호환). */
export interface StoreTreeNodeDto {
  id: string;
  label: string;
  level: StoreLevel;
  channel?: StoreChannel;
  storeCode?: string;
  metrics: StoreNodeMetrics;
  children: StoreTreeNodeDto[];
  isLeaf: boolean;
}

export interface StoreAggFilter {
  channel?: StoreChannel;
}

/**
 * 칸반행 → 노드 지표(대시보드 분기값 병합).
 *
 * @param usesFixDenom dash 부재 시 carry 분모 폴백 분기 — true(직영 채널·점포 리프)=픽스분모,
 *   false(전체·중관·기타 집계)=전체분모. dash 가 있으면 dash 의 실분모를 우선.
 *   stage2 의 분기(직영/점포=픽스 · 전체/중관/기타=전체)와 정합.
 */
function metricsOf(
  k: StoreKanbanRow,
  dash: StoreDashRow | undefined,
  usesFixDenom: boolean,
): StoreNodeMetrics {
  return {
    saleMult: dash?.saleMult ?? k.saleMult,
    dotsFix: k.dotsFix,
    dotsAll: k.dotsAll,
    summerPct: k.summerPct,
    inQtyFix: k.inQtyFix,
    saleQtyFix: k.saleQtyFix,
    cogsFix: k.cogsFix,
    summerInvQty: k.summerInvQty,
    invQtyFix: k.invQtyFix,
    invAmtFix: k.invAmtFix,
    inQtyAll: k.inQtyAll,
    saleQtyAll: k.saleQtyAll,
    invQtyAll: k.invQtyAll,
    invAmtAll: k.invAmtAll,
    dotsDays: dash?.dotsDays ?? k.dotsAll,
    seasonPct: dash?.seasonPct ?? k.summerPct,
    stockRatio: dash?.stockRatio ?? null,
    negQty: dash?.negQty ?? null,
    negAmt: dash?.negAmt ?? null,
    areaPyeong: dash?.areaPyeong ?? null,
    baseInvQty: dash?.baseInvQty ?? null,
    // 가드 carry 분모 — dash 있으면 실분모, 없으면 행종류 폴백(stage2 분기와 동일).
    dotsDaysDenom: dash?.dotsDaysDenom ?? (usesFixDenom ? k.dailyCogsFix : k.dailyCogsAll),
    seasonPctDenom: dash?.seasonPctDenom ?? (usesFixDenom ? k.invQtyFix : k.invQtyAll),
  };
}

/** StoreTreeNode → DTO(대시보드 행 병합). */
function toDto(
  node: StoreTreeNode,
  dashByCode: Map<string, StoreDashRow>,
): StoreTreeNodeDto {
  // 집계 노드(전체/채널)는 코드=라벨, 점포 리프는 storeCode.
  const code = node.isLeaf ? node.kanban.storeCode : node.label === "전체" ? "전체" : node.label;
  const dash = dashByCode.get(code);
  // 픽스 분모 분기: 점포 리프 또는 직영 채널 = 픽스(O/P) · 그외 집계 = 전체(AD/T).
  const usesFixDenom = node.isLeaf || node.channel === "직영";
  return {
    id: node.id,
    label: node.label,
    level: node.level,
    channel: node.channel,
    storeCode: node.isLeaf ? node.kanban.storeCode : undefined,
    metrics: metricsOf(node.kanban, dash, usesFixDenom),
    children: node.children.map((c) => toDto(c, dashByCode)),
    isLeaf: node.isLeaf,
  };
}

/**
 * 매장 드릴다운 트리(API 응답형).
 * @param filter.channel 지정 시 그 채널만 진입(루트 = 채널 노드, 라벨에 반영).
 */
export function buildStoreAggTree(
  dashboard: StoreDashboard,
  filter: StoreAggFilter = {},
): StoreTreeNodeDto {
  const dashByCode = new Map<string, StoreDashRow>();
  for (const row of dashboard.flatRows) dashByCode.set(row.code, row);

  if (filter.channel) {
    const channelNode = dashboard.root.children.find((c) => c.channel === filter.channel);
    if (channelNode) {
      const dto = toDto(channelNode, dashByCode);
      return { ...dto, id: "ROOT", label: `전체 · ${filter.channel}` };
    }
  }

  const dto = toDto(dashboard.root, dashByCode);
  return { ...dto, label: "전체 (매장 SCM)" };
}

/** 평탄화(엑셀 내보내기·검증용). */
export function flattenStoreAggTree(
  node: StoreTreeNodeDto,
  depth = 0,
): Array<{ node: StoreTreeNodeDto; depth: number }> {
  const out: Array<{ node: StoreTreeNodeDto; depth: number }> = [{ node, depth }];
  for (const c of node.children) out.push(...flattenStoreAggTree(c, depth + 1));
  return out;
}

export { flattenStoreTree };
