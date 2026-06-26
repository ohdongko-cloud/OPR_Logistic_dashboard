/**
 * 상품 데이터 조회 단일 진입점 — DB(CURRENT FactProductCum) 우선, 없으면 라이브파일 폴백.
 *
 * 설계(아이템 kanban-source·매장 store-source 와 동형):
 *   ① Neon 구성 + CURRENT PRODUCT 스냅샷 → DB 복원(factRowsToProduct).
 *   ② 그 외 → 라이브파일(아이템 xlsx) 파싱(ingestFiles) → buildProductFacts — 캐시(mtime 무효화).
 *
 * 두 경로 모두 동일한 ProductFactRow[] → buildProductAggTree 결과 동일(UI 안전).
 *
 * ★상품 RAW = 아이템 워크북과 동일 파일(매출상세·물류재고·센터입출고 공유). 별도 원본 없음.
 *   슬3·4 = 누적뷰(spec) → 기본 period=CUMULATIVE. 당월도 동일 파이프(파일만 교체).
 *
 * ⚠️ 실데이터 파일은 레포에 커밋하지 않는다. 서버 런타임에서 OPR_DATA_DIR 절대경로 "읽기만".
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { buildProductFacts, type ProductFactRow } from "@/lib/engine-product";
import { ingestFiles } from "@/lib/ingest";
import { getPrisma } from "@/lib/prisma";

import { loadCurrentProduct } from "./persist-product";

export type ProductPeriod = "MONTH" | "CUMULATIVE";
export type ProductSource = "db" | "livefile";

const DEFAULT_DATA_DIR = "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";

/** period → 아이템 실파일명(상품 RAW 공유). */
const PRODUCT_FILE_NAMES: Record<ProductPeriod, string> = {
  MONTH: "#.유통물류(OPR)_모니터링(아이템)_당월(1).xlsx",
  CUMULATIVE: "#.유통물류(OPR)_모니터링(아이템)_누적(1).xlsx",
};

export class ProductDataError extends Error {
  constructor(
    public code: "missing_file" | "ingest_failed",
    message: string,
  ) {
    super(message);
    this.name = "ProductDataError";
  }
}

export interface ResolvedProduct {
  facts: ProductFactRow[];
  source: ProductSource;
  snapshotId?: string;
}

function dataDir(): string {
  return process.env.OPR_DATA_DIR ?? DEFAULT_DATA_DIR;
}

function productFilePath(period: ProductPeriod): string {
  return path.join(dataDir(), PRODUCT_FILE_NAMES[period]);
}

interface CacheEntry {
  facts: ProductFactRow[];
  mtimeMs: number;
}
const cache = new Map<ProductPeriod, CacheEntry>();

/** 라이브파일 파싱(캐시 우선, mtime 무효화). */
function getProductFromFile(period: ProductPeriod): ResolvedProduct {
  const filePath = productFilePath(period);
  if (!existsSync(filePath)) {
    throw new ProductDataError(
      "missing_file",
      `상품 데이터 파일을 찾을 수 없습니다(${period}). 서버 경로를 확인하세요.`,
    );
  }
  const mtimeMs = statSync(filePath).mtimeMs;
  const cached = cache.get(period);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { facts: cached.facts, source: "livefile" };
  }
  const buf = readFileSync(filePath);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const ingest = ingestFiles([
    { name: PRODUCT_FILE_NAMES[period], size: buf.byteLength, bytes },
  ]);
  if (!ingest.ok) {
    throw new ProductDataError("ingest_failed", ingest.blockedReason ?? "상품 파일 검증 실패.");
  }
  const facts = buildProductFacts({ records: ingest.records });
  cache.set(period, { facts, mtimeMs });
  return { facts, source: "livefile" };
}

/** 캐시 비우기(테스트·핫리로드). */
export function clearProductCache(): void {
  cache.clear();
}

/**
 * period 의 상품 데이터를 DB 우선으로 해결.
 * DB 조회 실패는 라이브파일로 graceful 폴백(읽기 가용성 우선).
 */
export async function resolveProduct(period: ProductPeriod): Promise<ResolvedProduct> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const current = await loadCurrentProduct(prisma, period);
      if (current) {
        return { facts: current.facts, source: "db", snapshotId: current.snapshotId };
      }
    } catch (e) {
      console.error("[product-source] DB load failed, fallback to livefile", e);
    }
  }
  return getProductFromFile(period);
}
