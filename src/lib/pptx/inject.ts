/**
 * PPTX 템플릿 주입 — 마스킹 템플릿(.pptx) + 엔진 집계/주석 → 값 채운 .pptx 바이트.
 *
 * 방식(노드 런타임, Vercel 호환): fflate 로 unzip → 각 슬라이드 표 셀의 첫 <a:t> 텍스트만
 *   집계값으로 치환(서식 100% 보존) → zip. 다른 리소스는 무변.
 *
 * 검증된 엔진(resolveNode→rollup·store·product)만 사용 → 엑셀 100% 일치 유지.
 * R7(점포체화비중): 엔진 정의값(AL/U). 원본 .pptx 버그값(AL/R)과는 의도적 상이(엔진이 정답).
 *
 * 슬라이드 채움 범위:
 *   슬1(물류 핵심지표 당월)   = injectSlide1   — 아이템 엔진(FactRow) 30행×20열.
 *   슬2(매장 SCM)             = injectSlide2   — 매장 엔진(StoreDashRow) 전체/직영/점포14 × 매장 열.
 *   슬3·4(상품 SCM)           = 주입 보류      — 행↔노드 매핑 마스터 부재(slide34-map 주석). 공란 유지.
 *   슬5(물류 핵심지표 목표대비) = injectSlide5  — 아이템 엔진 현재값 + Annotation(목표·전년·조치).
 *
 * 공란 원칙: 빈 셀(런 없음)에는 새 런을 만들지 않음(skipIfNoRun). 데이터 없으면(null·annotation 부재) "".
 */

import { strToU8, unzipSync, zipSync } from "fflate";

import type { KanbanRow } from "@/lib/engine";
import type { StoreDashRow } from "@/lib/engine-store";
import type { AnnotationOverlay } from "@/lib/annotations/overlay";
import { nodeOverlayFor } from "@/lib/annotations/overlay";
import { findTableRanges, setCellText, type TableRanges } from "./table-xml";
import { resolveNode } from "./resolve-nodes";
import { SLIDE1_COLS, SLIDE1_ROWS, SLIDE1_TABLE_DIMS, formatPptCell } from "./slide1-map";
import {
  SLIDE2_COLS,
  SLIDE2_ROWS,
  SLIDE2_TABLE_DIMS,
  formatSlide2Cell,
} from "./slide2-map";
import {
  SLIDE5_ANNO_CELLS,
  SLIDE5_CURRENT_COLS,
  SLIDE5_ROWS,
  SLIDE5_TABLE_DIMS,
} from "./slide5-map";

const SLIDE1_PATH = "ppt/slides/slide1.xml";
const SLIDE2_PATH = "ppt/slides/slide2.xml";
const SLIDE5_PATH = "ppt/slides/slide5.xml";

export interface InjectInput {
  /** 마스킹 템플릿 바이트(assets/ppt-template.pptx). */
  templateBytes: Uint8Array;
  /** 엔진 Stage1 칸반(period 반영). */
  kanban: KanbanRow[];
  /** 기간 라벨(당월/누적) — 부제 주입용(선택). */
  periodLabel?: string;
}

/** 슬1(① 물류 핵심지표) 표를 채워 .pptx 바이트 반환. */
export function injectSlide1(input: InjectInput): Uint8Array {
  const files = unzipSync(input.templateBytes);
  const dec = new TextDecoder("utf-8");
  const slide1 = files[SLIDE1_PATH];
  if (!slide1) {
    throw new Error(`템플릿에 ${SLIDE1_PATH} 가 없습니다(손상된 템플릿).`);
  }
  let xml = dec.decode(slide1);

  let t: TableRanges = findTableRanges(xml);
  if (t.rows.length !== SLIDE1_TABLE_DIMS.rows) {
    throw new Error(
      `슬라이드1 표 행수 불일치: ${t.rows.length} ≠ ${SLIDE1_TABLE_DIMS.rows} (템플릿 재생성 필요)`,
    );
  }

  for (const ref of SLIDE1_ROWS) {
    const fact = resolveNode(input.kanban, ref);
    for (const col of SLIDE1_COLS) {
      const value = formatPptCell(col.scale, fact[col.field] as number | null);
      xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
      t = findTableRanges(xml);
    }
  }

  files[SLIDE1_PATH] = strToU8(xml);
  return zipSync(files, { level: 6 });
}

/** 슬2(매장 SCM) 주입 입력. */
export interface InjectSlide2Input {
  templateBytes: Uint8Array;
  /** 매장 대시보드 평탄 행(전체·채널·점포 — buildStoreDashboard.flatRows). */
  storeRows: StoreDashRow[];
}

/** 슬2 행 ref → 해당 StoreDashRow(없으면 null). */
export function resolveStoreRow(
  rows: StoreDashRow[],
  match: (typeof SLIDE2_ROWS)[number]["match"],
): StoreDashRow | null {
  switch (match.kind) {
    case "total":
      return rows.find((r) => r.level === "L0_TOTAL") ?? null;
    case "channel":
      return (
        rows.find((r) => r.level === "L1_CHANNEL" && r.code === match.channel) ?? null
      );
    case "storeOrder": {
      // 슬2 점포 표(r04~r17)는 직영 14점 전용 — 채널을 직영으로 좁힌다.
      // (큐레이션에 비직영 점포가 섞여도 직영 표에 엉뚱한 채널 점포가 들어가지 않도록.)
      const stores = rows.filter(
        (r) => r.level === "L2_STORE" && r.channel === "직영",
      );
      return stores[match.order] ?? null;
    }
    default:
      return null;
  }
}

/** 슬2(② 매장 SCM) 표를 채워 .pptx 바이트 반환. */
export function injectSlide2(input: InjectSlide2Input): Uint8Array {
  const files = unzipSync(input.templateBytes);
  const dec = new TextDecoder("utf-8");
  const slide2 = files[SLIDE2_PATH];
  if (!slide2) {
    throw new Error(`템플릿에 ${SLIDE2_PATH} 가 없습니다(손상된 템플릿).`);
  }
  let xml = dec.decode(slide2);

  let t: TableRanges = findTableRanges(xml);
  if (t.rows.length !== SLIDE2_TABLE_DIMS.rows) {
    throw new Error(
      `슬라이드2 표 행수 불일치: ${t.rows.length} ≠ ${SLIDE2_TABLE_DIMS.rows} (템플릿 재생성 필요)`,
    );
  }

  for (const ref of SLIDE2_ROWS) {
    const row = resolveStoreRow(input.storeRows, ref.match);
    if (!row) continue; // 매핑 행 부재(예: 점포 큐레이션 < 14) → 공란 유지.
    for (const col of SLIDE2_COLS) {
      const value = formatSlide2Cell(col.scale, row[col.field] as number | null);
      xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
      t = findTableRanges(xml);
    }
  }

  files[SLIDE2_PATH] = strToU8(xml);
  return zipSync(files, { level: 6 });
}

/** 슬5(목표 대비) 주입 입력. */
export interface InjectSlide5Input {
  templateBytes: Uint8Array;
  kanban: KanbanRow[];
  /** 주석 오버레이(목표·전년·조치). 없으면 해당 칸 공란. */
  overlay?: AnnotationOverlay;
}

/** 슬5(⑤ 물류 핵심지표 — 목표 대비) 표를 채워 .pptx 바이트 반환. */
export function injectSlide5(input: InjectSlide5Input): Uint8Array {
  const files = unzipSync(input.templateBytes);
  const dec = new TextDecoder("utf-8");
  const slide5 = files[SLIDE5_PATH];
  if (!slide5) {
    throw new Error(`템플릿에 ${SLIDE5_PATH} 가 없습니다(손상된 템플릿).`);
  }
  let xml = dec.decode(slide5);

  let t: TableRanges = findTableRanges(xml);
  if (t.rows.length !== SLIDE5_TABLE_DIMS.rows) {
    throw new Error(
      `슬라이드5 표 행수 불일치: ${t.rows.length} ≠ ${SLIDE5_TABLE_DIMS.rows} (템플릿 재생성 필요)`,
    );
  }

  const overlay = input.overlay;
  for (const ref of SLIDE5_ROWS) {
    const fact = resolveNode(input.kanban, ref);
    // ① 현재값(엔진 FactRow).
    for (const col of SLIDE5_CURRENT_COLS) {
      const value = formatPptCell(col.scale, fact[col.field] as number | null);
      xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
      t = findTableRanges(xml);
    }
    // ② 목표·전년·조치(annotation). 없으면 "".
    const ov = overlay
      ? nodeOverlayFor(overlay, {
          gender: ref.gender,
          newcarry: ref.newcarry,
          season: ref.ssfw ? `${ref.ssfw}시즌` : "",
          item: "",
        })
      : undefined;
    for (const cell of SLIDE5_ANNO_CELLS) {
      let value = "";
      if (ov) {
        if (cell.kind === "action") {
          value = ov.action ?? "";
        } else if (cell.metricCode && cell.scale) {
          const src =
            cell.kind === "target" ? ov.targets : ov.priorYearManual;
          const n = src[cell.metricCode as string];
          value = n != null ? formatPptCell(cell.scale, n) : "";
        }
      }
      xml = setCellText(xml, t, ref.row, cell.col, value, { skipIfNoRun: true });
      t = findTableRanges(xml);
    }
  }

  files[SLIDE5_PATH] = strToU8(xml);
  return zipSync(files, { level: 6 });
}

/** 전체 슬라이드(1·2·5) 일괄 주입 입력. 슬3·4 = 매핑 부재로 공란 유지. */
export interface InjectAllInput {
  templateBytes: Uint8Array;
  /** 아이템 엔진 칸반(슬1·5). */
  kanban: KanbanRow[];
  /** 매장 대시보드 평탄 행(슬2). 없으면 슬2 공란 유지. */
  storeRows?: StoreDashRow[];
  /** 주석 오버레이(슬5 목표·전년·조치). 없으면 해당 칸 공란. */
  overlay?: AnnotationOverlay;
  periodLabel?: string;
}

/**
 * 슬1·2·5 를 한 번에 채운 .pptx 바이트 반환(단일 unzip/zip — 효율·정합).
 * 슬3·4 는 행↔노드 매핑 마스터 부재로 주입하지 않는다(공란 유지, 가짜값 금지).
 */
export function injectAll(input: InjectAllInput): Uint8Array {
  const files = unzipSync(input.templateBytes);
  const dec = new TextDecoder("utf-8");
  const enc = strToU8;

  // ── 슬1 ──
  {
    const slide = files[SLIDE1_PATH];
    if (!slide) throw new Error(`템플릿에 ${SLIDE1_PATH} 가 없습니다.`);
    let xml = dec.decode(slide);
    let t = findTableRanges(xml);
    if (t.rows.length !== SLIDE1_TABLE_DIMS.rows) {
      throw new Error(`슬라이드1 표 행수 불일치: ${t.rows.length} ≠ ${SLIDE1_TABLE_DIMS.rows}`);
    }
    for (const ref of SLIDE1_ROWS) {
      const fact = resolveNode(input.kanban, ref);
      for (const col of SLIDE1_COLS) {
        const value = formatPptCell(col.scale, fact[col.field] as number | null);
        xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
        t = findTableRanges(xml);
      }
    }
    files[SLIDE1_PATH] = enc(xml);
  }

  // ── 슬2(매장) ── storeRows 있을 때만.
  if (input.storeRows) {
    const slide = files[SLIDE2_PATH];
    if (slide) {
      let xml = dec.decode(slide);
      let t = findTableRanges(xml);
      if (t.rows.length === SLIDE2_TABLE_DIMS.rows) {
        for (const ref of SLIDE2_ROWS) {
          const row = resolveStoreRow(input.storeRows, ref.match);
          if (!row) continue;
          for (const col of SLIDE2_COLS) {
            const value = formatSlide2Cell(col.scale, row[col.field] as number | null);
            xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
            t = findTableRanges(xml);
          }
        }
        files[SLIDE2_PATH] = enc(xml);
      }
    }
  }

  // ── 슬5(목표 대비) ──
  {
    const slide = files[SLIDE5_PATH];
    if (slide) {
      let xml = dec.decode(slide);
      let t = findTableRanges(xml);
      if (t.rows.length === SLIDE5_TABLE_DIMS.rows) {
        for (const ref of SLIDE5_ROWS) {
          const fact = resolveNode(input.kanban, ref);
          for (const col of SLIDE5_CURRENT_COLS) {
            const value = formatPptCell(col.scale, fact[col.field] as number | null);
            xml = setCellText(xml, t, ref.row, col.col, value, { skipIfNoRun: true });
            t = findTableRanges(xml);
          }
          const ov = input.overlay
            ? nodeOverlayFor(input.overlay, {
                gender: ref.gender,
                newcarry: ref.newcarry,
                season: ref.ssfw ? `${ref.ssfw}시즌` : "",
                item: "",
              })
            : undefined;
          for (const cell of SLIDE5_ANNO_CELLS) {
            let value = "";
            if (ov) {
              if (cell.kind === "action") value = ov.action ?? "";
              else if (cell.metricCode && cell.scale) {
                const srcMap = cell.kind === "target" ? ov.targets : ov.priorYearManual;
                const n = srcMap[cell.metricCode as string];
                value = n != null ? formatPptCell(cell.scale, n) : "";
              }
            }
            xml = setCellText(xml, t, ref.row, cell.col, value, { skipIfNoRun: true });
            t = findTableRanges(xml);
          }
        }
        files[SLIDE5_PATH] = enc(xml);
      }
    }
  }

  return zipSync(files, { level: 6 });
}
