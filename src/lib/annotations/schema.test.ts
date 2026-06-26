import { describe, expect, it } from "vitest";

import { annotationUpsertSchema, annotationDeleteSchema } from "./schema";

describe("annotationUpsertSchema — 입력 검증(zod)", () => {
  const baseKey = { gender: "여성", newcarry: "신상", season: "", item: "" };

  it("TARGET: metricCode + numValue 필수", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "TARGET",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      metricCode: "logiRatio",
      numValue: 0.12,
    });
    expect(r.success).toBe(true);
  });

  it("TARGET: 미등록 metricCode 거부", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "TARGET",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      metricCode: "해킹코드",
      numValue: 1,
    });
    expect(r.success).toBe(false);
  });

  it("TARGET: numValue 누락 거부", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "TARGET",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      metricCode: "logiRatio",
    });
    expect(r.success).toBe(false);
  });

  it("PRIOR_YEAR: 전년 수기값 — metricCode + numValue", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "PRIOR_YEAR",
      periodType: "CUMULATIVE",
      periodStart: "2026-06-01",
      key: baseKey,
      metricCode: "sales",
      numValue: 9_500_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("REMARK: textValue 필수, metricCode 불요", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "REMARK",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      textValue: "체화 증가 — 시즌오프 행사 검토",
    });
    expect(r.success).toBe(true);
  });

  it("REMARK: 빈 textValue 거부", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "REMARK",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      textValue: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("ACTION: textValue 필수", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "ACTION",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: baseKey,
      textValue: "벤더 입고 일정 재협의",
    });
    expect(r.success).toBe(true);
  });

  it("잘못된 날짜 포맷 거부", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "REMARK",
      periodType: "MONTH",
      periodStart: "2026/06/01",
      key: baseKey,
      textValue: "x",
    });
    expect(r.success).toBe(false);
  });

  it("전사(루트) 노드 키 허용(빈 4키)", () => {
    const r = annotationUpsertSchema.safeParse({
      kind: "REMARK",
      periodType: "MONTH",
      periodStart: "2026-06-01",
      key: { gender: "", newcarry: "", season: "", item: "" },
      textValue: "전사 비고",
    });
    expect(r.success).toBe(true);
  });
});

describe("annotationDeleteSchema", () => {
  it("id 필수", () => {
    expect(annotationDeleteSchema.safeParse({ id: "abc" }).success).toBe(true);
    expect(annotationDeleteSchema.safeParse({}).success).toBe(false);
  });
});
