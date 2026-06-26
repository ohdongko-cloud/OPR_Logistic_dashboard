/**
 * OTP 메일러 — 발송 경로 결정 + 메시지 렌더 단위 테스트(실제 SMTP 미발송).
 *
 * 검증:
 *   - resolveMailTransport: SMTP env 있으면 "smtp", 없으면 "dev-log".
 *   - production 에서 SMTP env 없으면 "unconfigured"(코드 로그 노출 금지).
 *   - buildOtpMessage: 코드·만료분이 본문에 포함, from/to/subject 구성.
 */
import { describe, expect, it } from "vitest";

import { buildOtpMessage, resolveMailTransport } from "./mailer";

describe("resolveMailTransport", () => {
  it("SMTP_USER·SMTP_PASS 있으면 smtp 모드", () => {
    expect(
      resolveMailTransport({
        SMTP_USER: "bot@gmail.com",
        SMTP_PASS: "app-pw",
        NODE_ENV: "production",
      }),
    ).toBe("smtp");
  });

  it("EMAIL_SERVER(URL) 단일 env 로도 smtp 모드", () => {
    expect(
      resolveMailTransport({
        EMAIL_SERVER: "smtp://bot%40gmail.com:pw@smtp.gmail.com:587",
        NODE_ENV: "production",
      }),
    ).toBe("smtp");
  });

  it("개발(NODE_ENV!=production) + SMTP 미설정 → dev-log 폴백", () => {
    expect(resolveMailTransport({ NODE_ENV: "development" })).toBe("dev-log");
    expect(resolveMailTransport({ NODE_ENV: "test" })).toBe("dev-log");
    expect(resolveMailTransport({})).toBe("dev-log");
  });

  it("production + SMTP 미설정 → unconfigured(코드 로그 금지)", () => {
    expect(resolveMailTransport({ NODE_ENV: "production" })).toBe(
      "unconfigured",
    );
  });

  it("부분 SMTP(USER 만, PASS 없음)는 smtp 로 보지 않는다", () => {
    expect(
      resolveMailTransport({ SMTP_USER: "bot@gmail.com", NODE_ENV: "production" }),
    ).toBe("unconfigured");
  });
});

describe("buildOtpMessage", () => {
  it("코드와 만료(분)를 본문에 포함하고 to/subject 를 구성", () => {
    const msg = buildOtpMessage({
      to: "user@eland.co.kr",
      code: "042718",
      ttlMinutes: 10,
      from: "OPR 대시보드 <bot@gmail.com>",
    });
    expect(msg.to).toBe("user@eland.co.kr");
    expect(msg.from).toBe("OPR 대시보드 <bot@gmail.com>");
    expect(msg.subject).toContain("인증");
    expect(msg.text).toContain("042718");
    expect(msg.text).toContain("10");
    expect(msg.html).toContain("042718");
  });

  it("from 미지정 시 기본 발신자 사용", () => {
    const msg = buildOtpMessage({
      to: "user@eland.co.kr",
      code: "111111",
      ttlMinutes: 10,
    });
    expect(msg.from).toBeTruthy();
  });
});
