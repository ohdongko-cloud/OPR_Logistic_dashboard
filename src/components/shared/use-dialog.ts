"use client";

import { useCallback, useEffect, useId, useRef } from "react";

/**
 * 모달/슬라이드오버 공통 접근성 훅 — ESC 닫기 · 포커스 이동/복원 · 포커스 트랩 · dialog 시맨틱.
 *
 * 적용: SKU 상세 패널·입력면 패널 등 우측 슬라이드 패널.
 *   (a) Escape keydown → onClose
 *   (b) role="dialog" aria-modal aria-labelledby(헤더 h2 id 연결) — dialogProps/titleId 로 부착
 *   (c) 열릴 때 패널 첫 focusable(또는 컨테이너)로 focus 이동 · 닫힐 때 트리거 요소로 복원
 *   (d) Tab/Shift+Tab 순환 가두는 focus-trap
 *
 * 키보드 사용자가 ESC 로 닫고, 스크린리더가 모달임을 인지하며, 포커스가 배경으로 새지 않게 한다.
 */

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 포커스 트랩 결정(순수 함수 — 단위테스트용). Tab 키 시 다음 포커스 인덱스를 계산한다.
 *  - 마지막에서 Tab → 첫 요소(wrap). 첫에서 Shift+Tab → 마지막(wrap).
 *  - 포커스가 패널 밖(activeIndex<0)이면 방향에 따라 첫/마지막으로 가둠.
 *  - 가둘 필요 없으면(중간 이동) null(브라우저 기본 Tab 허용).
 * @returns 강제 포커스할 인덱스(없으면 null) — count===0 이면 -1(컨테이너로 가둠).
 */
export function nextTrapFocus(args: {
  count: number;
  activeIndex: number; // 패널 내 포커스 인덱스(-1=패널 밖)
  shift: boolean;
}): number | null {
  const { count, activeIndex, shift } = args;
  if (count === 0) return -1; // 포커스 가능 요소 없음 → 컨테이너에 가둠.
  const first = 0;
  const last = count - 1;
  const outside = activeIndex < 0;
  if (shift) {
    if (activeIndex === first || outside) return last;
    return null;
  }
  if (activeIndex === last || outside) return first;
  return null;
}

export interface UseDialogResult {
  /** 패널 컨테이너 ref(role=dialog 요소에 부착). */
  ref: React.RefObject<HTMLDivElement | null>;
  /** 헤더 제목(h2) id — aria-labelledby 연결용. */
  titleId: string;
  /** 컨테이너에 펼칠 ARIA/role 속성. */
  dialogProps: {
    role: "dialog";
    "aria-modal": true;
    "aria-labelledby": string;
    tabIndex: -1;
  };
}

/**
 * @param open 패널 열림 여부.
 * @param onClose 닫기 콜백(ESC·트랩 외 클릭에서 호출).
 */
export function useDialog(open: boolean, onClose: () => void): UseDialogResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // 닫힘 시 복원할 직전 포커스 요소(열릴 때의 activeElement).
  const triggerRef = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = focusables[0];
    if (first) first.focus();
    else root.focus(); // tabIndex=-1 컨테이너로 폴백.
  }, []);

  // 열릴 때: 트리거 기억 → 패널로 포커스 이동. 닫힐 때: 트리거로 복원.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    // 렌더 직후 포커스(다음 틱).
    const id = requestAnimationFrame(focusFirst);
    return () => {
      cancelAnimationFrame(id);
      // 복원 — 트리거가 여전히 문서에 있으면 포커스 되돌림.
      const t = triggerRef.current;
      if (t && document.contains(t)) t.focus();
    };
  }, [open, focusFirst]);

  // ESC 닫기 + Tab 포커스 트랩.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const active = document.activeElement as HTMLElement | null;
      const activeIndex = active ? focusables.indexOf(active) : -1;
      const target = nextTrapFocus({
        count: focusables.length,
        activeIndex: root.contains(active) ? activeIndex : -1,
        shift: e.shiftKey,
      });
      if (target === null) return; // 패널 내 정상 이동 — 기본 Tab 허용.
      e.preventDefault();
      if (target === -1) root.focus(); // 포커스 가능 요소 없음 → 컨테이너.
      else focusables[target]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return {
    ref,
    titleId,
    dialogProps: {
      role: "dialog",
      "aria-modal": true,
      "aria-labelledby": titleId,
      tabIndex: -1,
    },
  };
}
