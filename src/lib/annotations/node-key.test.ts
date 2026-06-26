import { describe, expect, it } from "vitest";

import {
  annotationMatchesNode,
  nodeKeyOf,
  serializeNodeKey,
} from "./node-key";
import { ROOT_NODE_KEY } from "./types";

describe("nodeKeyOf — 트리 노드 → 정규 4키", () => {
  it("부분 키를 빈문자열로 채운다(전사 루트)", () => {
    expect(nodeKeyOf({})).toEqual(ROOT_NODE_KEY);
  });

  it("성별만 있는 노드", () => {
    expect(nodeKeyOf({ gender: "여성" })).toEqual({
      gender: "여성",
      newcarry: "",
      season: "",
      item: "",
    });
  });

  it("아이템 리프 4키 전부", () => {
    expect(
      nodeKeyOf({ gender: "남성", newcarry: "신상", season: "봄", item: "상의류" }),
    ).toEqual({ gender: "남성", newcarry: "신상", season: "봄", item: "상의류" });
  });
});

describe("serializeNodeKey — 안정 문자열 키", () => {
  it("루트는 ROOT", () => {
    expect(serializeNodeKey(ROOT_NODE_KEY)).toBe("ROOT");
  });

  it("4키 파이프 결합", () => {
    expect(
      serializeNodeKey({ gender: "여성", newcarry: "신상", season: "봄", item: "상의류" }),
    ).toBe("여성|신상|봄|상의류");
  });

  it("부분 키도 자리 보존(빈 슬롯)", () => {
    expect(serializeNodeKey({ gender: "여성", newcarry: "", season: "", item: "" })).toBe(
      "여성|||",
    );
  });
});

describe("annotationMatchesNode — DB 행(NULL=빈) ↔ 노드 키 매칭", () => {
  const node = { gender: "여성", newcarry: "신상", season: "", item: "" };

  it("NULL 컬럼은 빈문자열과 동치", () => {
    expect(
      annotationMatchesNode(
        { gender: "여성", newcarry: "신상", season: null, item: null },
        node,
      ),
    ).toBe(true);
  });

  it("키 불일치는 false", () => {
    expect(
      annotationMatchesNode(
        { gender: "남성", newcarry: "신상", season: null, item: null },
        node,
      ),
    ).toBe(false);
  });

  it("전사(루트) 주석은 루트 노드에만 매칭", () => {
    const rootAnno = { gender: null, newcarry: null, season: null, item: null };
    expect(annotationMatchesNode(rootAnno, ROOT_NODE_KEY)).toBe(true);
    expect(annotationMatchesNode(rootAnno, node)).toBe(false);
  });
});
