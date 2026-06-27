/**
 * OTP 검증(authorize) 경로 레이트리밋 — 이메일+IP 슬라이딩 윈도(인메모리).
 *
 * 발급(requestOtp)에는 쿨다운+윈도 리밋이 있으나 검증(signIn 'otp' → authorize → verifyOtpForEmail)
 * 자체에는 별도 리밋이 없어, 대량 이메일을 가로질러 병렬 추측하거나 NextAuth credentials 콜백을
 * 고빈도로 때리는 행위를 막는 장치가 없었다(리뷰 #9). 여기서 (email|ip) 키 분당 N회로 캡한다.
 *
 * ⚠️ 인메모리 — 서버리스(다중 인스턴스)에서는 인스턴스별 카운트라 전역 보장이 아니다.
 *   단일 장기 프로세스(자체 호스팅)에서 실효적. 운영 외부노출 시 Upstash 등 분산 카운터로 대체 권고.
 *   현 위협모델(사내 도메인 한정·작은 모수)에서 1차 방어로 충분.
 */

/** 윈도 길이(ms). */
export const VERIFY_WINDOW_MS = 60 * 1000; // 1분
/** 윈도당 키별 최대 검증 시도. */
export const VERIFY_MAX_PER_WINDOW = 10;

/** 키 → 윈도 내 시도 타임스탬프(ms) 목록. */
const hits = new Map<string, number[]>();

export interface VerifyRateResult {
  allowed: boolean;
  /** 남은 허용 횟수(참고용). */
  remaining: number;
}

/**
 * 검증 시도 1건을 기록·판정(순수 부수효과 — 호출 시점에 카운트 증가).
 * @param key   이메일+IP 합성 키(rateKey 로 생성).
 * @param now   현재 시각(테스트 주입).
 * @param max   윈도당 한도(테스트 주입).
 */
export function checkVerifyRate(
  key: string,
  now: number = Date.now(),
  max: number = VERIFY_MAX_PER_WINDOW,
  windowMs: number = VERIFY_WINDOW_MS,
): VerifyRateResult {
  const cutoff = now - windowMs;
  const prev = hits.get(key) ?? [];
  const inWindow = prev.filter((t) => t > cutoff);

  if (inWindow.length >= max) {
    hits.set(key, inWindow); // 만료분 정리(현 시도는 기록 안 함 — 거부).
    return { allowed: false, remaining: 0 };
  }
  inWindow.push(now);
  hits.set(key, inWindow);
  // 메모리 위생: 가끔 만료된 키 청소(맵 무한증식 방지).
  if (hits.size > 5_000) pruneExpired(now, windowMs);
  return { allowed: true, remaining: Math.max(0, max - inWindow.length) };
}

/** 만료 키 청소(윈도 밖 타임스탬프만 남은 키 제거). */
function pruneExpired(now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  for (const [k, arr] of hits) {
    const live = arr.filter((t) => t > cutoff);
    if (live.length === 0) hits.delete(k);
    else hits.set(k, live);
  }
}

/** 이메일+IP 합성 키. IP 미상이면 'unknown'(이메일 단위로는 여전히 캡). */
export function rateKey(email: string, ip: string | null | undefined): string {
  return `${email.trim().toLowerCase()}|${ip ?? "unknown"}`;
}

/** 테스트용 초기화. */
export function resetVerifyRate(): void {
  hits.clear();
}
