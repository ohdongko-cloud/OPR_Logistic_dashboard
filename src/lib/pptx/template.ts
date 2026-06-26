/**
 * 마스킹 PPTX 템플릿 로더(서버 전용).
 *
 * 템플릿(assets/ppt-template.pptx)은 **마스킹된** 커밋 자산 → 번들/배포에 포함.
 * 런타임 주입값(엔진 집계)만 서버 메모리에서 채워 응답으로 흘려보낸다(영속화 없음).
 *
 * Next/Turbopack 의 정적 자산 추적이 불안정할 수 있어, 환경변수(OPR_PPT_TEMPLATE)로
 * 절대경로 재정의를 허용한다. 기본은 repo 루트 기준 assets/ 경로.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_REL = "assets/ppt-template.pptx";

let cache: { bytes: Uint8Array; mtimeMs: number } | null = null;

function templatePath(): string {
  return process.env.OPR_PPT_TEMPLATE ?? path.resolve(process.cwd(), DEFAULT_REL);
}

export class TemplateMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateMissingError";
  }
}

/** 템플릿 바이트(mtime 캐시). 부재 시 명시적 에러(클라엔 안전 메시지로 변환할 것). */
export function loadTemplateBytes(): Uint8Array {
  const fp = templatePath();
  if (!existsSync(fp)) {
    throw new TemplateMissingError(`PPTX 템플릿을 찾을 수 없습니다: ${fp}`);
  }
  const mtimeMs = statSync(fp).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.bytes;
  const buf = readFileSync(fp);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  cache = { bytes, mtimeMs };
  return bytes;
}
