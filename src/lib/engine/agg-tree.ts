/**
 * 드릴다운 트리 빌더 — 검증된 엔진(rollup) 위에 5단계 중첩 트리 + SKU 상세.
 *
 * 근거: 대시보드_설계_v1.md §3(드릴다운 5단계: 전체→성별→신상이월→시즌→아이템→SKU)
 *       · 엔진_transform_spec.md §5(ROLLUP: 데이터=SUM·파생=재계산).
 *
 * 이 모듈은 **집계를 새로 계산하지 않는다** — 검증된 `rollup`(stage2)을 그대로 호출해
 * 노드별 FactRow 를 만들고, 트리 형태(children)로 묶는다. 따라서 엑셀 100% 일치가 유지된다.
 *
 * 필터(성별·신상이월·시즌·아이템)는 **트리 진입 모집단을 좁히는 술어**로 적용된다
 * (설계 §4-2: "필터 = 트리 진입점 점프"). 각 노드의 값은 필터 적용된 칸반 부분집합에서 재집계.
 */

import {
  isClassified,
  rollup,
  seasonGroup,
} from "./stage2-aggregate";
import {
  FW_SEASONS,
  SS_SEASONS,
  type FactKey,
  type FactLevel,
  type FactRow,
  type KanbanRow,
} from "./types";

/** 드릴다운 필터 — 비어있으면 전체. */
export interface DrilldownFilter {
  gender?: string; // 여성·남성·아동
  newcarry?: string; // 신상·이월
  season?: string; // 봄·여름·가을·겨울·공통 (실시즌)
  item?: string; // 상의류·하의류·…
}

/** 트리 노드 — FactRow(집계 25지표) + 표시 라벨 + 자식. */
export interface TreeNode {
  /** 안정 경로 키(드릴다운 확장상태·React key). 예 "여성|신상|봄|상의류" */
  id: string;
  /** 레벨 표시 라벨(이 노드가 추가한 차원값). 예 "여성", "신상", "봄", "상의류", "전체(OPR)" */
  label: string;
  level: FactLevel;
  /** 4키(필터·SKU 조회용). */
  key: FactKey;
  /** 집계 지표(엔진 rollup 출력 — 엑셀 동형). */
  metrics: FactRow;
  /** 자식 노드(리프 L5_ITEM 은 없음). */
  children: TreeNode[];
  /** 리프(아이템) 여부 — SKU 상세 조회 가능. */
  isLeaf: boolean;
}

const GENDERS = ["여성", "남성", "아동"] as const;
const NEWCARRIES = ["신상", "이월"] as const;
const SEASONS = ["봄", "여름", "가을", "겨울", "공통"] as const;
const ITEMS = [
  "상의류",
  "하의류",
  "액티브",
  "명품류",
  "잡화류",
  "내의류",
  "아동복",
] as const;

const SEASON_GROUP_LABEL: Record<string, "SS시즌" | "FW시즌"> = {};
for (const s of SS_SEASONS) SEASON_GROUP_LABEL[s] = "SS시즌";
for (const s of FW_SEASONS) SEASON_GROUP_LABEL[s] = "FW시즌";

function keyOf(
  gender = "",
  newcarry = "",
  season = "",
  item = "",
): FactKey {
  return { gender, newcarry, season, item };
}

/** 필터 술어 — 비어있는 항목은 무시(전체). 분류 매칭(isClassified) 전제. */
function filterPredicate(f: DrilldownFilter): (k: KanbanRow) => boolean {
  return (k) =>
    (!f.gender || k.gender === f.gender) &&
    (!f.newcarry || k.newcarry === f.newcarry) &&
    (!f.season || k.season === f.season) &&
    (!f.item || k.item === f.item);
}

/**
 * 칸반 → 드릴다운 트리.
 *
 * 루트(전체) 1노드. 자식은 (필터 미지정 차원)을 단계적으로 펼친다.
 * 필터가 지정된 차원은 트리에 노출하지 않고(이미 고정), 그 아래 차원부터 펼친다 — "진입점 점프".
 *
 * 노드 생성은 전부 rollup(검증된 stage2)으로 → 엑셀 동형 보장.
 * 빈 노드(자식·지표 모두 0)는 트리에서 제거(드릴다운 가독성).
 */
export function buildDrilldownTree(
  kanban: KanbanRow[],
  filter: DrilldownFilter = {},
): TreeNode {
  const classified = kanban.filter(isClassified);
  const fpred = filterPredicate(filter);
  // 필터 적용 모집단(루트·전 노드 공통 술어).
  const base = (extra: (k: KanbanRow) => boolean) => (k: KanbanRow) =>
    fpred(k) && extra(k);

  // 루트 라벨 = 필터 요약 또는 전체.
  const rootLabel = filterLabel(filter);

  const root: TreeNode = {
    id: "ROOT",
    label: rootLabel,
    level: "L0_TOTAL",
    key: keyOf(filter.gender, filter.newcarry, filter.season, filter.item),
    metrics: rollup(classified, root_key(filter), "L0_TOTAL", base(() => true)),
    children: [],
    isLeaf: false,
  };

  // 펼침 순서(설계 §3-1): 성별 → 신상이월 → 시즌 → 아이템.
  // 필터로 고정된 차원은 건너뛴다.
  const genders = filter.gender ? [filter.gender] : GENDERS;
  const showGender = !filter.gender;

  for (const g of genders) {
    const gPred = base((k) => k.gender === g);
    const newcarries = filter.newcarry ? [filter.newcarry] : NEWCARRIES;
    const showNewcarry = !filter.newcarry;

    const buildSeasonItems = (
      parentChildren: TreeNode[],
      ncFilterPred: (k: KanbanRow) => boolean,
      gv: string,
      ncv: string,
    ) => {
      const seasons = filter.season ? [filter.season] : SEASONS;
      const showSeason = !filter.season;
      for (const s of seasons) {
        const sPred = (k: KanbanRow) => ncFilterPred(k) && k.season === s;
        const seasonItems: TreeNode[] = [];
        const items = filter.item ? [filter.item] : ITEMS;
        for (const it of items) {
          const node = makeNode(
            classified,
            `${gv}|${ncv}|${s}|${it}`,
            it,
            "L5_ITEM",
            keyOf(gv, ncv, s, it),
            (k) => sPred(k) && k.item === it,
            true,
          );
          if (node) seasonItems.push(node);
        }
        if (showSeason) {
          const sNode = makeNode(
            classified,
            `${gv}|${ncv}|${s}`,
            s,
            "L4_SEASON",
            keyOf(gv, ncv, s),
            sPred,
            false,
            seasonItems,
          );
          if (sNode) parentChildren.push(sNode);
        } else {
          // 시즌 고정 → 아이템을 부모(신상이월 또는 성별)에 직접 매단다.
          parentChildren.push(...seasonItems);
        }
      }
    };

    if (showNewcarry) {
      const ncNodes: TreeNode[] = [];
      for (const nc of newcarries) {
        const ncPred = (k: KanbanRow) => gPred(k) && k.newcarry === nc;
        const seasonChildren: TreeNode[] = [];
        buildSeasonItems(seasonChildren, ncPred, g, nc);
        const ncNode = makeNode(
          classified,
          `${g}|${nc}`,
          nc,
          "L2_NEWCARRY",
          keyOf(g, nc),
          ncPred,
          false,
          seasonChildren,
        );
        if (ncNode) ncNodes.push(ncNode);
      }
      if (showGender) {
        const gNode = makeNode(
          classified,
          g,
          g,
          "L1_GENDER",
          keyOf(g),
          gPred,
          false,
          ncNodes,
        );
        if (gNode) root.children.push(gNode);
      } else {
        root.children.push(...ncNodes);
      }
    } else {
      // 신상이월 고정 → 성별 아래 바로 시즌(또는 아이템).
      const ncPred = (k: KanbanRow) => gPred(k) && k.newcarry === filter.newcarry!;
      const seasonChildren: TreeNode[] = [];
      buildSeasonItems(seasonChildren, ncPred, g, filter.newcarry!);
      if (showGender) {
        const gNode = makeNode(
          classified,
          g,
          g,
          "L1_GENDER",
          keyOf(g),
          gPred,
          false,
          seasonChildren,
        );
        if (gNode) root.children.push(gNode);
      } else {
        root.children.push(...seasonChildren);
      }
    }
  }

  return root;
}

/** 노드 생성 — 술어 부분집합이 비면(모든 지표 0 & 자식 0) null 반환. */
function makeNode(
  kanban: KanbanRow[],
  id: string,
  label: string,
  level: FactLevel,
  key: FactKey,
  predicate: (k: KanbanRow) => boolean,
  isLeaf: boolean,
  children: TreeNode[] = [],
): TreeNode | null {
  const metrics = rollup(kanban, key, level, predicate);
  // 빈 노드 제거: 자식도 없고 핵심 지표(매출·재고·물류비)도 0 이면 스킵.
  const empty =
    children.length === 0 &&
    metrics.sales === 0 &&
    metrics.logiCost === 0 &&
    metrics.ctrAmt === 0 &&
    metrics.stoAmt === 0 &&
    metrics.inQty === 0 &&
    metrics.outQty === 0;
  if (isLeaf && empty) return null;
  if (!isLeaf && children.length === 0 && empty) return null;
  return { id, label, level, key, metrics, children, isLeaf };
}

/** 루트 FactKey(필터 고정값 반영). */
function root_key(f: DrilldownFilter): FactKey {
  return keyOf(f.gender, f.newcarry, f.season, f.item);
}

/** 루트 라벨 — 필터 요약. */
function filterLabel(f: DrilldownFilter): string {
  const parts = [f.gender, f.newcarry, f.season, f.item].filter(Boolean);
  return parts.length === 0 ? "전체 (OPR)" : parts.join(" · ");
}

/** 평탄화 — 모든 노드를 깊이우선 평면 배열로(엑셀 내보내기·검증용). */
export function flattenTree(node: TreeNode, depth = 0): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [{ node, depth }];
  for (const c of node.children) out.push(...flattenTree(c, depth + 1));
  return out;
}

// ── SKU 상세(리프 클릭 → 모달) ──

/** SKU 1행 상세 — 칸반 grain. 설계 §3 L5(아이템 클릭 → SKU 모달). */
export interface SkuDetail {
  skuKey: string;
  /** 매출액(N) */
  sales: number;
  /** 추정매출(J) */
  estSales: number;
  /** 물류비(K) */
  logiCost: number;
  /** 센터재고량(Y) */
  ctrQty: number;
  /** 센터재고액(Z) */
  ctrAmt: number;
  /** 점포재고액(AF) */
  stoAmt: number;
  /** 센터체화액(AC) */
  ctrDeadAmt: number;
  /** 입고량(AT) */
  inQty: number;
  /** 출고량(AZ) */
  outQty: number;
  /** 반품량(BD) */
  retQty: number;
}

/**
 * 4키 노드(아이템 리프)의 SKU 상세 목록.
 * 칸반에서 해당 4키 + 필터에 매칭되는 SKU 행을 추려 grain 그대로 반환.
 */
export function skuDetailsFor(
  kanban: KanbanRow[],
  key: Partial<FactKey>,
): SkuDetail[] {
  const rows = kanban.filter(
    (k) =>
      (!key.gender || k.gender === key.gender) &&
      (!key.newcarry || k.newcarry === key.newcarry) &&
      (!key.season || k.season === key.season) &&
      (!key.item || k.item === key.item) &&
      isClassified(k),
  );
  return rows
    .map((k) => ({
      skuKey: k.skuKey,
      sales: k.n_sales,
      estSales: k.j_estSales,
      logiCost: k.k_logiCost,
      ctrQty: k.y_ctrQty,
      ctrAmt: k.z_ctrAmt,
      stoAmt: k.af_stoAmt,
      ctrDeadAmt: k.ac_ctrDeadAmt,
      inQty: k.at_inQty,
      outQty: k.az_outQty,
      retQty: k.bd_retQty,
    }))
    // 표시 정렬: 매출액 내림차순(주요 SKU 우선).
    .sort((a, b) => b.sales - a.sales);
}

export { seasonGroup };
