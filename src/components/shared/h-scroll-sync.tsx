"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PROXY_THRESHOLD_PX, clampScrollLeft, shouldApplySync } from "./scroll-sync";

/**
 * 상단 가로 스크롤바(프록시) ↔ 테이블 본문 양방향 동기 — 3뷰(엔진·매장·상품) 공통.
 *
 * 배경(UI 피드백): 페이지 전체가 세로 스크롤되면서 테이블의 가로 스크롤바가 본문 맨 아래(세로 끝)에만
 *   남아, 넓은 지표열을 좌우로 보려면 한참 내려가야 했다. → 헤더 위(컨트롤바 아래)에 sticky 로 얇은
 *   프록시 가로 스크롤바를 두고, 본문(overflow-x-auto)의 scrollLeft 와 양방향으로 묶는다.
 *   페이지를 내리지 않고도 상단에서 좌우 스크롤이 된다. 기존 하단 가로 스크롤·sticky 헤더/첫열은 유지.
 *
 * 구현:
 *   - 프록시 = 빈 inner div(width = 본문 scrollWidth)를 가진 overflow-x-auto 컨테이너.
 *   - 한쪽 scroll 이벤트 → 다른 쪽 scrollLeft 반영(clamp). shouldApplySync 로 동일값 재기록을
 *     막아 상호 반영 무한루프를 차단(별도 플래그 불필요 — 값이 같아지면 자연히 수렴·정지).
 *   - 본문 너비 변화(밀도 토글·검색 필터로 행/열 변동, 리사이즈)는 ResizeObserver 로 추적해
 *     inner width 와 프록시 노출여부를 갱신한다.
 */

export interface HScrollSync {
  /** 테이블 본문(overflow-x-auto) 컨테이너 ref — 기존 스크롤 div 에 그대로 부착. */
  bodyRef: React.RefObject<HTMLDivElement | null>;
  /** 상단 프록시 스크롤 컨테이너 ref. */
  proxyRef: React.RefObject<HTMLDivElement | null>;
  /** 본문 콘텐츠 실제 너비(px) — 프록시 inner div 폭에 미러. */
  contentWidth: number;
  /** 가로 넘침이 있어 프록시를 띄울 가치가 있는지(임계 초과). */
  overflowing: boolean;
}

export function useHScrollSync(): HScrollSync {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const proxyRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  // 본문 너비/넘침 측정 — 밀도 토글·검색·리사이즈로 폭이 바뀌면 갱신.
  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const sw = body.scrollWidth;
    const cw = body.clientWidth;
    setContentWidth(sw);
    setOverflowing(sw - cw > PROXY_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const proxy = proxyRef.current;
    if (!body || !proxy) return;

    // 한쪽 → 다른 쪽 반영(clamp + 동일값 재기록 차단으로 루프 방지).
    const sync = (from: HTMLDivElement, to: HTMLDivElement) => {
      const max = to.scrollWidth - to.clientWidth;
      const desired = clampScrollLeft(from.scrollLeft, max);
      if (shouldApplySync(to.scrollLeft, desired)) {
        to.scrollLeft = desired;
      }
    };

    const onBodyScroll = () => sync(body, proxy);
    const onProxyScroll = () => sync(proxy, body);

    body.addEventListener("scroll", onBodyScroll, { passive: true });
    proxy.addEventListener("scroll", onProxyScroll, { passive: true });

    // 너비/넘침 추적(본문·내부 테이블 크기 변화 모두).
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(body);
    const tableEl = body.firstElementChild;
    if (tableEl) ro.observe(tableEl);
    window.addEventListener("resize", measure);

    return () => {
      body.removeEventListener("scroll", onBodyScroll);
      proxy.removeEventListener("scroll", onProxyScroll);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return { bodyRef, proxyRef, contentWidth, overflowing };
}

/**
 * 상단 프록시 가로 스크롤바(sticky) — 컨트롤바 아래·테이블 헤더 위에 배치.
 *
 * 빈 inner div(width = 본문 contentWidth)만 두어, 사용자가 이 얇은 영역을 좌우로 끌면
 *   useHScrollSync 가 본문 scrollLeft 에 반영한다(반대도 동일). 넘침이 없으면 렌더 안 함.
 *
 * ref/state 는 호출부에서 구조분해해 개별 prop 으로 받는다(react-hooks/refs: 렌더 중 객체에서
 *   ref 멤버접근 금지 회피).
 */
export function TopHScrollbar({
  proxyRef,
  contentWidth,
  overflowing,
  className = "",
}: {
  proxyRef: React.RefObject<HTMLDivElement | null>;
  contentWidth: number;
  overflowing: boolean;
  className?: string;
}) {
  if (!overflowing) return null;
  return (
    <div
      ref={proxyRef}
      // sticky top-0: 페이지를 내려도 컨트롤바 아래에 붙어 상단에서 좌우 스크롤 가능.
      // 얇은 가로 바(opr-hscroll-proxy 스타일) — 본문과 동일 scrollWidth 를 inner 로 재현.
      className={[
        "opr-hscroll-proxy sticky top-0 z-30 overflow-x-auto overflow-y-hidden",
        "border-b border-zinc-100 bg-white/90 backdrop-blur",
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  );
}
