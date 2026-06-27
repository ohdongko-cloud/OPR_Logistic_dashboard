#!/usr/bin/env sh
# 우발적 시크릿 커밋 차단 — pre-commit 훅 본체.
#
# 동작: 스테이징된 변경(git diff --cached)을 스캔. gitleaks 가 있으면 그걸로 정밀 검사하고,
#   없으면 경량 정규식 폴백으로 흔한 시크릿 패턴(키/토큰/비밀번호/.env)을 차단.
#   탐지 시 비0 종료 → 커밋 거부.
#
# 설치: npm run hooks:install (package.json) 또는
#   git config core.hooksPath .githooks  (저장소 훅 경로 등록)
#
# 우회(정당한 경우): git commit --no-verify (남용 금지 — 마스킹·로컬보안 헌장 §4).

set -e

# 1) .env* 파일이 스테이징되면 즉시 차단(.env.example 제외).
staged_env=$(git diff --cached --name-only --diff-filter=ACM | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)
if [ -n "$staged_env" ]; then
  echo "✖ 시크릿 차단: .env 류 파일이 스테이징됨 — 커밋 금지." >&2
  echo "$staged_env" | sed 's/^/   /' >&2
  echo "   (실 시크릿은 Vercel 환경변수/시크릿 매니저로. .env.example 만 커밋 가능.)" >&2
  exit 1
fi

# 2) gitleaks 정밀 스캔(있으면). 프로젝트 .gitleaks.toml(기본룰 + npg_/vcp_/AUTH_SECRET/SMTP_PASS) 사용.
if command -v gitleaks >/dev/null 2>&1; then
  root=$(git rev-parse --show-toplevel)
  cfg="$root/.gitleaks.toml"
  if [ -f "$cfg" ]; then
    gl_cfg="--config $cfg"
  else
    gl_cfg=""
  fi
  # gitleaks v8: `git --staged` 가 스테이징 diff 를 스캔(protect 는 deprecated).
  if ! gitleaks git --staged --redact --no-banner $gl_cfg; then
    echo "✖ gitleaks 가 스테이징 변경에서 시크릿을 탐지했습니다 — 커밋 거부." >&2
    exit 1
  fi
  exit 0
fi

# 3) gitleaks 미설치 → 경량 정규식 폴백(완전치 않음 — gitleaks 설치 권장).
echo "ℹ gitleaks 미설치 — 정규식 폴백 스캔(정밀도 낮음). 설치 권장: https://github.com/gitleaks/gitleaks" >&2
patterns='(AWS_SECRET|aws_secret_access_key|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]+|gh[pousr]_[0-9A-Za-z]{20,}|vcp_[0-9A-Za-z]{20,}|npg_[0-9A-Za-z]{16,}|AUTH_SECRET\s*=\s*[^\s]|SMTP_PASS\s*=\s*[^\s]|password\s*=\s*[A-Za-z0-9!@#$%^&*]{8,})'
hits=$(git diff --cached -U0 --diff-filter=ACM | grep -E '^\+' | grep -nEi "$patterns" || true)
if [ -n "$hits" ]; then
  echo "✖ 시크릿 의심 패턴 탐지 — 커밋 거부(폴백 스캔):" >&2
  echo "$hits" | sed 's/^/   /' >&2
  echo "   오탐이면 git commit --no-verify (단, 실 시크릿이 아님을 확인 후)." >&2
  exit 1
fi

exit 0
