import { describe, expect, it } from "vitest";

import { buildAnnotationOverlay, nodeOverlayFor } from "./overlay";
import { type AnnotationDto } from "./types";

function anno(p: Partial<AnnotationDto>): AnnotationDto {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    kind: p.kind ?? "REMARK",
    periodType: p.periodType ?? "MONTH",
    periodStart: p.periodStart ?? "2026-06-01",
    gender: p.gender ?? null,
    newcarry: p.newcarry ?? null,
    season: p.season ?? null,
    item: p.item ?? null,
    metricCode: p.metricCode ?? null,
    numValue: p.numValue ?? null,
    textValue: p.textValue ?? null,
    authorEmail: p.authorEmail ?? null,
    updatedAt: p.updatedAt ?? "2026-06-26T00:00:00.000Z",
  };
}

describe("buildAnnotationOverlay — 주석 목록 → 노드별 오버레이 맵", () => {
  it("TARGET 을 노드 키 + 지표코드로 색인", () => {
    const ov = buildAnnotationOverlay([
      anno({ kind: "TARGET", gender: "여성", metricCode: "logiRatio", numValue: 0.12 }),
    ]);
    const node = nodeOverlayFor(ov, { gender: "여성" });
    expect(node.targets.logiRatio).toBe(0.12);
  });

  it("PRIOR_YEAR 수기값을 분리 저장", () => {
    const ov = buildAnnotationOverlay([
      anno({ kind: "PRIOR_YEAR", gender: "여성", metricCode: "sales", numValue: 9e9 }),
    ]);
    const node = nodeOverlayFor(ov, { gender: "여성" });
    expect(node.priorYearManual.sales).toBe(9e9);
  });

  it("REMARK·ACTION 텍스트를 노드에 모은다", () => {
    const ov = buildAnnotationOverlay([
      anno({ kind: "REMARK", gender: "여성", textValue: "체화 증가" }),
      anno({ kind: "ACTION", gender: "여성", textValue: "행사 검토" }),
    ]);
    const node = nodeOverlayFor(ov, { gender: "여성" });
    expect(node.remark).toBe("체화 증가");
    expect(node.action).toBe("행사 검토");
  });

  it("전사(NULL 키) 주석은 루트 노드로", () => {
    const ov = buildAnnotationOverlay([
      anno({ kind: "REMARK", textValue: "전사 비고" }),
    ]);
    const root = nodeOverlayFor(ov, {});
    expect(root.remark).toBe("전사 비고");
    // 다른 노드엔 안 새어나감.
    const other = nodeOverlayFor(ov, { gender: "남성" });
    expect(other.remark).toBeUndefined();
  });

  it("매칭 주석 없는 노드는 빈 오버레이", () => {
    const ov = buildAnnotationOverlay([]);
    const node = nodeOverlayFor(ov, { gender: "여성" });
    expect(node.targets).toEqual({});
    expect(node.remark).toBeUndefined();
  });
});
