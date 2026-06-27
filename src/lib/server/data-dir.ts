/**
 * 라이브파일 데이터 폴더 경로 해결 — 신뢰경계 명확화(리뷰 #10).
 *
 * 우선순위:
 *   1) env.OPR_DATA_DIR (운영·개발 공통 — 명시 설정).
 *   2) 미설정 시 dev(NODE_ENV!=='production')에서만 개발자 로컬 기본경로 폴백.
 *   3) production + 미설정 → fail-fast throw(개발자 절대경로로 실데이터를 OS 에서 직접 읽지 않음).
 *
 * 근거: 마스킹 안 된 실적 원본의 출처를 환경설정으로 강제(헌장 §보안). DB-우선이라 영향은
 *   적으나(resolve* 가 DB CURRENT 우선), 라이브파일 폴백 발동 시 출처 신뢰경계를 분명히 한다.
 */

/** 개발 전용 기본 데이터 폴더(커밋 대상 아님 — dev 폴백). */
export const DEV_DEFAULT_DATA_DIR = "D:/vibe/OPR_Logistic_auto03/05_대시보드 원본 파일";

export class DataDirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataDirError";
  }
}

/**
 * 라이브파일 데이터 폴더 절대경로. OPR_DATA_DIR 우선, 미설정 시 dev 폴백, prod 는 throw.
 *
 * @param opts 테스트 주입용(기본=process.env 읽기). 운영 호출부는 인자 없이 사용.
 */
export function resolveDataDir(opts?: { dataDir?: string; isProduction?: boolean }): string {
  const fromEnv = (opts?.dataDir ?? process.env.OPR_DATA_DIR)?.trim();
  if (fromEnv) return fromEnv;

  const isProd = opts?.isProduction ?? process.env.NODE_ENV === "production";
  if (isProd) {
    throw new DataDirError(
      "OPR_DATA_DIR 미설정 — 운영 환경에서는 라이브파일 폴백을 허용하지 않습니다(DB CURRENT 스냅샷 필요).",
    );
  }
  // dev 전용 폴백.
  return DEV_DEFAULT_DATA_DIR;
}
