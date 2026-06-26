/**
 * 입력면(Annotation) 공개 표면 — 목표·전년·비고·조치·물류비(수기).
 *
 * 출력면(엔진 집계)과 분리(헌장 §입력/출력 분리). 화면은 오버레이로 겹친다.
 */

export * from "./types";
export * from "./node-key";
export * from "./compare";
export * from "./overlay";
export * from "./schema";
// repo 는 서버 전용(Prisma) — 클라 번들 유입 방지 위해 직접 import 권장.
