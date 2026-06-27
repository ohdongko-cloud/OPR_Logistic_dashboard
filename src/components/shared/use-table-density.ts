"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 트리테이블 밀도(조밀/보통) 훅 — 3뷰(엔진·매장·상품) 공통.
 *
 * UI 피드백 ①: "조밀/보통" 토글로 한 화면에 더 많은 행을 보이게.
 *   - compact(조밀) = 행높이·셀 상하패딩·폰트 축소(py 7→3px · font 12.5→11.5px · 셀패딩 압축).
 *   - comfortable(보통) = 현행(변경 없음).
 *   - localStorage 키 `opr.tableDensity` 로 유지 · 3뷰 공유(어느 뷰에서 바꿔도 공통 적용).
 *
 * 순수 헬퍼(normalizeDensity·toggleDensity·densityTokens)는 브라우저 의존이 없어 단위테스트 가능
 *   (use-dialog 의 nextTrapFocus 분리 전략과 동일 — 테스트 환경 node).
 * 훅 자체는 window/localStorage 접근 + SSR 안전(초기 comfortable, 마운트 후 동기화)만 담당.
 */

export type TableDensity = "comfortable" | "compact";

/** 3뷰 공유 localStorage 키. */
export const DENSITY_STORAGE_KEY = "opr.tableDensity";

/** 저장값(임의 문자열)을 유효 밀도로 정규화 — 잡값·null 은 보통(현행). */
export function normalizeDensity(v: string | null | undefined): TableDensity {
  return v === "compact" ? "compact" : "comfortable";
}

/** 2상 토글. */
export function toggleDensity(d: TableDensity): TableDensity {
  return d === "compact" ? "comfortable" : "compact";
}

/** 모드별 Tailwind 토큰 — 트리테이블 셀/헤더/폰트에 주입. */
export interface DensityTokens {
  /** 표 기본 폰트 크기. */
  tableFont: string;
  /** 데이터 셀 상하 패딩(행높이 핵심). */
  cellPadY: string;
  /** 데이터 셀 좌우 패딩. */
  cellPadX: string;
  /** 헤더 셀 상하 패딩. */
  headPadY: string;
  /** 토글 버튼 표기 라벨(현재 모드). */
  label: string;
  /** 토글 버튼 보조표기(전환 대상). */
  nextLabel: string;
}

const TOKENS: Record<TableDensity, DensityTokens> = {
  // 현행 값 보존(회귀 방지) — 기존 트리테이블이 쓰던 py-[7px]·12.5px·px-2.
  comfortable: {
    tableFont: "text-[12.5px]",
    cellPadY: "py-[7px]",
    cellPadX: "px-2",
    headPadY: "py-1",
    label: "보통",
    nextLabel: "조밀",
  },
  // 조밀 — 행/패딩/폰트 압축으로 한눈에 더 많은 행.
  compact: {
    tableFont: "text-[11.5px]",
    cellPadY: "py-[3px]",
    cellPadX: "px-1.5",
    headPadY: "py-0.5",
    label: "조밀",
    nextLabel: "보통",
  },
};

export function densityTokens(d: TableDensity): DensityTokens {
  return TOKENS[d];
}

export interface UseTableDensityResult {
  density: TableDensity;
  tokens: DensityTokens;
  setDensity: (d: TableDensity) => void;
  toggle: () => void;
}

// localStorage 기반 외부 스토어 — useSyncExternalStore 구독(3뷰·탭 간 단일 진실원).
//   같은 탭 내 다른 트리테이블도 같은 스토어를 구독 → 한 곳에서 바꾸면 전부 갱신.

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // 다른 탭/창의 변경(storage 이벤트)도 구독.
  const onStorage = (e: StorageEvent) => {
    if (e.key === DENSITY_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readSnapshot(): TableDensity {
  try {
    return normalizeDensity(window.localStorage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return "comfortable";
  }
}

/** 서버/초기 스냅샷 — SSR=클라 일치(hydration mismatch 방지). */
function readServerSnapshot(): TableDensity {
  return "comfortable";
}

function writeDensity(d: TableDensity) {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, d);
  } catch {
    /* 저장 실패 무시 */
  }
  emit(); // 같은 탭 내 모든 구독자 갱신(storage 이벤트는 타 탭에만 발생).
}

/**
 * 밀도 상태 훅 — localStorage 단일 진실원, 3뷰·탭 간 동기.
 *
 * SSR 안전: 서버 스냅샷=comfortable(서버=클라 동일) → 클라이언트 마운트 후 저장값으로 정합.
 *   useSyncExternalStore 가 hydration·구독을 처리해 effect 내 setState 없이 동기화.
 */
export function useTableDensity(): UseTableDensityResult {
  const density = useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);

  const setDensity = useCallback((d: TableDensity) => writeDensity(d), []);
  const toggle = useCallback(() => writeDensity(toggleDensity(readSnapshot())), []);

  return { density, tokens: densityTokens(density), setDensity, toggle };
}
