/**
 * 트리테이블 밀도(조밀/보통) 순수 로직 probe — densityTokens·toggleDensity·normalizeDensity.
 *
 * UI 피드백 ①: 3뷰 공통 "조밀/보통" 토글. localStorage 키 `opr.tableDensity` 로 유지·3뷰 공유.
 *   훅(useTableDensity)은 브라우저 의존(window/localStorage)이라 여기선 순수 헬퍼만 검증한다
 *   (use-dialog 의 nextTrapFocus 와 동일한 분리 전략 — 테스트 환경 node).
 */

import { describe, expect, it } from "vitest";

import {
  DENSITY_STORAGE_KEY,
  densityTokens,
  normalizeDensity,
  toggleDensity,
  type TableDensity,
} from "./use-table-density";

describe("normalizeDensity — 저장값 파싱(하위호환·기본값)", () => {
  it("유효값은 그대로", () => {
    expect(normalizeDensity("compact")).toBe("compact");
    expect(normalizeDensity("comfortable")).toBe("comfortable");
  });

  it("null·미지정·잡값 → 기본 comfortable(보통=현행)", () => {
    expect(normalizeDensity(null)).toBe("comfortable");
    expect(normalizeDensity(undefined)).toBe("comfortable");
    expect(normalizeDensity("")).toBe("comfortable");
    expect(normalizeDensity("dense")).toBe("comfortable");
    expect(normalizeDensity("COMPACT")).toBe("comfortable");
  });
});

describe("toggleDensity — 2상 토글", () => {
  it("comfortable ↔ compact", () => {
    expect(toggleDensity("comfortable")).toBe("compact");
    expect(toggleDensity("compact")).toBe("comfortable");
  });
});

describe("densityTokens — 모드별 셀/폰트 토큰", () => {
  it("보통(comfortable) = 현행 값 보존(py-[7px]·12.5px·셀패딩 px-2)", () => {
    const t = densityTokens("comfortable");
    expect(t.cellPadY).toBe("py-[7px]");
    expect(t.tableFont).toBe("text-[12.5px]");
    expect(t.cellPadX).toBe("px-2");
    expect(t.headPadY).toBe("py-1");
  });

  it("조밀(compact) = 행높이·패딩·폰트 축소(더 많은 행)", () => {
    const t = densityTokens("compact");
    expect(t.cellPadY).toBe("py-[3px]");
    expect(t.tableFont).toBe("text-[11.5px]");
    expect(t.cellPadX).toBe("px-1.5");
    expect(t.headPadY).toBe("py-0.5");
  });

  it("조밀이 보통보다 세로 패딩이 작다(조밀=더 조밀)", () => {
    const compactPad = Number(densityTokens("compact").cellPadY.match(/(\d+)/)?.[1]);
    const comfyPad = Number(densityTokens("comfortable").cellPadY.match(/(\d+)/)?.[1]);
    expect(compactPad).toBeLessThan(comfyPad);
  });

  it("라벨·다음모드 = 토글 버튼 표기용", () => {
    expect(densityTokens("comfortable").label).toBe("보통");
    expect(densityTokens("compact").label).toBe("조밀");
  });
});

describe("DENSITY_STORAGE_KEY — 3뷰 공유 키 계약", () => {
  it("키는 opr.tableDensity 로 고정(3뷰 공유)", () => {
    expect(DENSITY_STORAGE_KEY).toBe("opr.tableDensity");
  });
});

// 타입 노출 확인(컴파일 가드).
const _t: TableDensity = "compact";
void _t;
