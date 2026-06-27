/**
 * 시즌 라벨 동적화 (C12) 단위테스트.
 *
 * 핵심: 헤더 텍스트에서 시즌명 추출 → 라벨 동적 생성. default="여름"(현행 불변).
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEASON_LABEL,
  detectSeasonFromHeader,
  resolveSeasonLabel,
  seasonCommonInvQtyLabel,
  seasonInvQtyLabel,
  seasonShareLabel,
} from "./season-label";

describe("detectSeasonFromHeader — 헤더 텍스트 → 시즌명", () => {
  it("실파일 칸반 헤더(여름비중·여름/공통 재고량)에서 여름 추출", () => {
    expect(detectSeasonFromHeader("여름비중")).toBe("여름");
    expect(detectSeasonFromHeader("여름/공통\n재고량")).toBe("여름");
    expect(detectSeasonFromHeader("여름,공통")).toBe("여름");
  });

  it("가을/겨울/봄 헤더도 인식(미래 스냅샷)", () => {
    expect(detectSeasonFromHeader("가을/공통\n재고량")).toBe("가을");
    expect(detectSeasonFromHeader("겨울비중")).toBe("겨울");
    expect(detectSeasonFromHeader("봄,공통")).toBe("봄");
  });

  it("시즌어 없으면 null(폴백 트리거)", () => {
    expect(detectSeasonFromHeader("재고량")).toBeNull();
    expect(detectSeasonFromHeader("")).toBeNull();
    expect(detectSeasonFromHeader(null)).toBeNull();
    expect(detectSeasonFromHeader(undefined)).toBeNull();
  });
});

describe("resolveSeasonLabel — 우선순위 폴백", () => {
  it("첫 탐지 후보 = 시즌명(우선순위 순서)", () => {
    expect(resolveSeasonLabel(["여름비중", null])).toBe("여름");
    // 앞 후보가 비시즌이면 다음 후보로.
    expect(resolveSeasonLabel(["재고량", "가을/공통\n재고량"])).toBe("가을");
  });

  it("모든 후보 실패 → default(여름) — 현행 비트단위 동일", () => {
    expect(resolveSeasonLabel([])).toBe(DEFAULT_SEASON_LABEL);
    expect(resolveSeasonLabel([null, "재고량", ""])).toBe("여름");
    expect(DEFAULT_SEASON_LABEL).toBe("여름");
  });
});

describe("라벨 생성기 — 현행(여름) 동일성", () => {
  it("여름 입력 시 현행 라벨과 동일", () => {
    expect(seasonShareLabel("여름")).toBe("여름비중");
    expect(seasonInvQtyLabel("여름")).toBe("여름재고량");
    expect(seasonCommonInvQtyLabel("여름")).toBe("여름/공통 재고량");
  });

  it("가을 입력 시 동적 표기", () => {
    expect(seasonShareLabel("가을")).toBe("가을비중");
    expect(seasonInvQtyLabel("가을")).toBe("가을재고량");
    expect(seasonCommonInvQtyLabel("겨울")).toBe("겨울/공통 재고량");
  });
});
