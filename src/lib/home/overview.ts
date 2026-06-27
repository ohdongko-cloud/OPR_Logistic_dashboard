/**
 * 홈(개요) 집계·경보 산출 — 순수 로직(테스트 가능, 서버·클라 무관).
 *
 * 입력 = 엔진 트리(TreeNode) · 매장 트리(StoreTreeNodeDto) · 주석 목록(AnnotationDto[]).
 * 출력 = 요약 KPI(루트 핵심) + 경보 카드(상위 N, 의사결정 직결).
 *
 * 원칙(작업지시·헌장):
 *   - 가짜값 금지 — 데이터 없으면 빈 배열·null. 임의 임계 신설 금지(기존 재사용).
 *   - 희소 분모 가드(metric-guard) 재사용 — 오해성 극단값(14,000%·601일)은 경보·KPI 에서 제외.
 *   - 임계 = CRITICAL_THRESHOLDS(엔진) · STORE_CRITICAL_THRESHOLDS(매장) 그대로.
 *   - 경보 클릭 → 해당 뷰로 진입점 점프(필터 쿼리스트링) — 드릴다운과 동일 계약.
 */

import { type AnnotationDto } from "@/lib/annotations";
import {
  METRIC_LOWER_IS_BETTER,
  isTargetMetric,
  TARGET_METRIC_LABEL,
  TARGET_METRIC_FORMAT,
  type TargetMetric,
} from "@/lib/annotations/types";
import {
  CRITICAL_THRESHOLDS,
  engineRatioDenom,
  engineRatioMin,
  flattenTree,
  type FactRow,
  type TreeNode,
} from "@/lib/engine";
import {
  flattenStoreAggTree,
  STORE_CRITICAL_THRESHOLDS,
  type StoreTreeNodeDto,
} from "@/lib/engine-store";
import { RATIO_DENOM_MIN, shouldSuppressRatio } from "@/lib/metric-guard";

// ── 공용 타입 ─────────────────────────────────────────────────────────────

export type AlertKind = "DEAD_STOCK" | "HIGH_RATIO" | "NEG_STOCK" | "TARGET_MISS";
export type Severity = "high" | "medium";

/** 경보 카드 1건 — 의사결정 직결(상위 N). 클릭 시 href 로 진입점 점프. */
export interface HomeAlert {
  kind: AlertKind;
  /** 카드 제목(짧게). */
  title: string;
  /** 대상(노드/점포 라벨). */
  subject: string;
  /** 보조 설명(수치·맥락). */
  detail: string;
  /** 정렬·표시용 대표 수치(비율=0~1, 금액=원, 일수=일). */
  value: number;
  severity: Severity;
  /** 클릭 시 이동 경로(해당 뷰 + 필터). */
  href: string;
}

/** 요약 KPI 1개 — 라벨·값·포맷·가드. 가짜값 금지(데이터 없으면 value=null). */
export interface OverviewKpi {
  id: string;
  label: string;
  value: number | null;
  format: "eok" | "pct" | "days" | "qty" | "mult";
  /** 희소 분모/데이터 부족으로 표기 보류. */
  suppressed: boolean;
  /** 위험(임계 초과) 강조. */
  warn?: boolean;
  /** 보류 사유(툴팁). */
  reason?: string;
}

// ── 요약 KPI ──────────────────────────────────────────────────────────────

/** 엔진 비율 KPI 의 희소 분모 가드 판정. */
function engineSuppressed(field: keyof FactRow, m: FactRow): boolean {
  const min = engineRatioMin(field);
  if (min == null) return false;
  const denom = engineRatioDenom(field, m);
  return shouldSuppressRatio(denom, min);
}

/**
 * 홈 요약 KPI — 3영역 핵심.
 *   엔진(루트): 물류비율 · 센터재고일수 · 센터체화비중 · 실매출
 *   매장(루트, 있으면): 판매배수 · (−)재고 금액
 * 희소 분모면 suppressed=true(가짜값 금지). 임계 초과면 warn.
 */
export function buildOverviewKpis(
  engineRoot: TreeNode | null,
  storeRoot: StoreTreeNodeDto | null,
): OverviewKpi[] {
  const out: OverviewKpi[] = [];

  if (engineRoot) {
    const m = engineRoot.metrics;
    const ratioSup = engineSuppressed("logiRatio", m);
    out.push({
      id: "logiRatio",
      label: "물류비율",
      value: m.logiRatio,
      format: "pct",
      suppressed: ratioSup,
      warn: !ratioSup && (m.logiRatio ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh,
      reason: ratioSup ? "분모(매출) 미미 — 참고 불가" : undefined,
    });

    const daysSup = engineSuppressed("dotsCtr", m);
    out.push({
      id: "dotsCtr",
      label: "센터 재고일수",
      value: m.dotsCtr,
      format: "days",
      suppressed: daysSup,
      warn: !daysSup && (m.dotsCtr ?? 0) >= CRITICAL_THRESHOLDS.daysHigh,
      reason: daysSup ? "분모(일평균소진) 미미 — 참고 불가" : undefined,
    });

    const deadSup = engineSuppressed("deadCtrPct", m);
    out.push({
      id: "deadCtrPct",
      label: "센터 체화비중",
      value: m.deadCtrPct,
      format: "pct",
      suppressed: deadSup,
      warn: !deadSup && (m.deadCtrPct ?? 0) >= CRITICAL_THRESHOLDS.ratioHigh,
      reason: deadSup ? "분모(센터재고액) 미미 — 참고 불가" : undefined,
    });

    out.push({
      id: "sales",
      label: "실매출(추정)",
      value: m.sales,
      format: "eok",
      suppressed: false,
    });
  }

  if (storeRoot) {
    const sm = storeRoot.metrics;
    // 판매배수 — 입고대비 판매 저조(임계 미만) 경고.
    const multWarn =
      sm.saleMult != null && sm.saleMult > 0 && sm.saleMult < STORE_CRITICAL_THRESHOLDS.multLow;
    out.push({
      id: "saleMult",
      label: "판매배수(매장)",
      value: sm.saleMult,
      format: "mult",
      suppressed: sm.saleMult == null,
      warn: multWarn,
    });

    // (−)마이너스 재고 금액 — 음수면 경고(데이터 오류·미정산 신호).
    out.push({
      id: "negAmt",
      label: "(−)재고 금액(매장)",
      value: sm.negAmt,
      format: "eok",
      suppressed: sm.negAmt == null,
      warn: sm.negAmt != null && sm.negAmt < 0,
    });
  }

  return out;
}

// ── 엔진 경보(악성 체화 · 물류비율) ──────────────────────────────────────────

/** 4키 리프 id("여성|신상|봄|상의류") → 엔진 뷰 필터 쿼리. */
function engineHref(id: string): string {
  const [gender, newcarry, season, item] = id.split("|");
  const sp = new URLSearchParams();
  if (gender) sp.set("gender", gender);
  if (newcarry) sp.set("newcarry", newcarry);
  if (season) sp.set("season", season);
  if (item) sp.set("item", item);
  const qs = sp.toString();
  return qs ? `/engine?${qs}` : "/engine";
}

/**
 * 엔진 경보 — 리프(아이템) 단위 악성 체화 + 고물류비율.
 *   - 체화비중(deadCtrPct) ≥ ratioHigh & 분모(센터재고액) 충분 → DEAD_STOCK.
 *   - 물류비율(logiRatio)  ≥ ratioHigh & 분모(매출) 충분 → HIGH_RATIO.
 * 희소 분모는 가드(metric-guard)로 제외(오해성 극단값 배격).
 * 대표 수치(value) 내림차순, 상위 limit.
 */
export function buildEngineAlerts(engineRoot: TreeNode, limit: number): HomeAlert[] {
  const leaves = flattenTree(engineRoot)
    .map((f) => f.node)
    .filter((n) => n.isLeaf);

  const dead: HomeAlert[] = [];
  const ratio: HomeAlert[] = [];

  for (const n of leaves) {
    const m = n.metrics;
    // 악성 체화: 분모(센터재고액) 충분 + 체화비중 임계 초과.
    if (
      m.deadCtrPct != null &&
      m.deadCtrPct >= CRITICAL_THRESHOLDS.ratioHigh &&
      !shouldSuppressRatio(m.ctrAmt, RATIO_DENOM_MIN.amount)
    ) {
      dead.push({
        kind: "DEAD_STOCK",
        title: "악성 체화",
        subject: nodeLabel(n.id),
        detail: `센터 체화비중 ${pct(m.deadCtrPct)} · 체화액 ${eok(m.ctrDeadAmt)}`,
        value: m.deadCtrPct,
        severity: m.deadCtrPct >= CRITICAL_THRESHOLDS.ratioHigh * 2 ? "high" : "medium",
        href: engineHref(n.id),
      });
    }
    // 고물류비율: 분모(매출) 충분 + 물류비율 임계 초과.
    if (
      m.logiRatio != null &&
      m.logiRatio >= CRITICAL_THRESHOLDS.ratioHigh &&
      !shouldSuppressRatio(m.sales, RATIO_DENOM_MIN.amount)
    ) {
      ratio.push({
        kind: "HIGH_RATIO",
        title: "고물류비율",
        subject: nodeLabel(n.id),
        detail: `물류비율 ${pct(m.logiRatio)} · 매출 ${eok(m.sales)}`,
        value: m.logiRatio,
        severity: m.logiRatio >= CRITICAL_THRESHOLDS.ratioHigh * 2 ? "high" : "medium",
        href: engineHref(n.id),
      });
    }
  }

  dead.sort((a, b) => b.value - a.value);
  ratio.sort((a, b) => b.value - a.value);
  return [...dead.slice(0, limit), ...ratio.slice(0, limit)];
}

// ── 매장 경보((−)마이너스 재고) ──────────────────────────────────────────────

/**
 * 매장 경보 — 점포 리프 단위 (−)마이너스 재고.
 *   negAmt < 0 인 점포를 절대값 내림차순으로(가장 큰 음수 먼저). 상위 limit.
 */
export function buildStoreAlerts(storeRoot: StoreTreeNodeDto, limit: number): HomeAlert[] {
  const leaves = flattenStoreAggTree(storeRoot)
    .map((f) => f.node)
    .filter((n) => n.isLeaf);

  const neg: HomeAlert[] = [];
  for (const n of leaves) {
    const amt = n.metrics.negAmt;
    if (amt != null && amt < 0) {
      neg.push({
        kind: "NEG_STOCK",
        title: "(−)마이너스 재고",
        subject: n.storeCode ?? n.label,
        detail: `(−)재고 금액 ${eok(amt)}${n.metrics.negQty != null ? ` · ${qty(n.metrics.negQty)}점` : ""}`,
        value: amt,
        severity: amt <= -10_000_000 ? "high" : "medium",
        href: storeHref(n.storeCode),
      });
    }
  }
  // 절대값 큰 음수 먼저(가장 음수 = value 작음 → 오름차순).
  neg.sort((a, b) => a.value - b.value);
  return neg.slice(0, limit);
}

function storeHref(storeCode?: string): string {
  return storeCode ? `/store?store=${encodeURIComponent(storeCode)}` : "/store";
}

// ── 목표 미달 경보(annotation 있을 때) ───────────────────────────────────────

/**
 * 목표 미달 경보 — 루트(전사) TARGET 주석 대비 현재값.
 *   비용성 지표(LOWER_IS_BETTER): 현재 > 목표 → 미달.
 *   매출형 지표: 현재 < 목표 → 미달.
 * 주석/목표 없으면 빈 배열(가짜값 금지). 전사 루트 노드(NULL 4키)만 비교(MVP).
 */
export function buildTargetMissAlerts(
  engineRoot: TreeNode,
  annotations: AnnotationDto[],
  limit: number,
): HomeAlert[] {
  const m = engineRoot.metrics;
  const out: HomeAlert[] = [];

  // 전사(루트) 목표만 — 4키 모두 비어있는 TARGET.
  const rootTargets = annotations.filter(
    (a) =>
      a.kind === "TARGET" &&
      !a.gender &&
      !a.newcarry &&
      !a.season &&
      !a.item &&
      a.metricCode &&
      a.numValue != null &&
      isTargetMetric(a.metricCode),
  );

  for (const a of rootTargets) {
    const code = a.metricCode as TargetMetric;
    const target = a.numValue as number;
    const current = (m as unknown as Record<string, number | null>)[code];
    if (current == null) continue; // 현재값 공란 → 비교 불가(가짜값 금지).

    const lowerBetter = METRIC_LOWER_IS_BETTER[code];
    const miss = lowerBetter ? current > target : current < target;
    if (!miss) continue;

    const gap = Math.abs(current - target);
    // 달성률 괴리 비율(목표 대비) — 정렬·심각도.
    const gapRatio = target !== 0 ? gap / Math.abs(target) : 1;
    out.push({
      kind: "TARGET_MISS",
      title: "목표 미달",
      subject: TARGET_METRIC_LABEL[code],
      detail: `현재 ${fmtMetric(code, current)} / 목표 ${fmtMetric(code, target)}`,
      value: gapRatio,
      severity: gapRatio >= 0.2 ? "high" : "medium",
      href: "/engine",
    });
  }

  out.sort((a, b) => b.value - a.value);
  return out.slice(0, limit);
}

// ── 표시 헬퍼(라벨·포맷) ─────────────────────────────────────────────────────

/** "여성|신상|봄|상의류" → "여성 · 신상 · 봄 · 상의류". */
function nodeLabel(id: string): string {
  return id
    .split("|")
    .filter(Boolean)
    .join(" · ");
}

function fmtMetric(code: TargetMetric, v: number): string {
  switch (TARGET_METRIC_FORMAT[code]) {
    case "pct":
      return pct(v);
    case "days":
      return `${Math.round(v)}일`;
    case "eok":
      return eok(v);
    case "qty":
      return qty(v);
    default:
      return String(v);
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function eok(v: number): string {
  return `${(v / 1e8).toFixed(1)}억`;
}
function qty(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}
