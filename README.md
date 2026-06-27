# OPR 물류 실적 대시보드

> OPR 물류 실적 보고(현재 엑셀→수기 PPT)를 **자동 집계 웹 대시보드**로 옮긴다.
> 메인 엔진 = `※대시보드(시즌-아이템)` 시트 — **성별 × 신상이월 × 시즌 × 아이템** 5단계 드릴다운(접었다 폈다).
>
> 설계 근거(문서 허브 `OPR_Logistic_auto03`):
> - `04_시스템_설계/대시보드_설계_v1.md` (UX·지표·드릴다운·데이터 계약)
> - `04_시스템_설계/입력_출력_분리_원칙.md`
>
> ⚠️ **현재 = 골격(foundation) 단계.** 비즈니스 로직(데이터 모델·ETL·위젯)은
> 아키텍처 문서 확정 후 다음 단계에서 채운다. 지금은 구조·인증골격·탭 자리만.

## 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, TypeScript, src dir) |
| 스타일 | Tailwind CSS v4 |
| DB / ORM | Neon Postgres + Prisma 7 (driver adapter `@prisma/adapter-neon`) |
| 인증 | Auth.js (NextAuth v5) — provider 미정(골격), 도메인 제한 가드 |
| 배포 | Vercel (전제) |

## 디렉터리

```
src/
  app/
    layout.tsx                 루트 레이아웃 (ko, 메타데이터)
    page.tsx                   루트 → /engine 리다이렉트(랜딩)
    globals.css
    (dashboard)/               대시보드 공통 레이아웃(헤더+탭+기간토글)
      layout.tsx
      engine/page.tsx          ① 물류 핵심지표 (엔진 드릴다운) — 랜딩
      store/page.tsx           ② 매장 SCM
      product/page.tsx         ③ 상품 SCM
      admin/page.tsx           관리자 (RBAC·업로드·입력면)
    api/
      health/route.ts          GET /api/health (헬스 체크)
      auth/[...nextauth]/route.ts  Auth.js 핸들러
  components/
    nav-tabs.tsx               전역 탭
    period-toggle.tsx          당월/누적 토글(골격)
    view-stub.tsx              빈 뷰 스텁
  lib/
    env.ts                     환경변수 접근 + 구성여부 헬퍼
    prisma.ts                  Prisma 싱글턴(Neon adapter, DB 미구성 시 null)
    nav.ts                     탭 정의 + 랜딩 경로
    auth/allowlist.ts          로그인 도메인 제한 가드(안전한 기본값=차단)
  auth.ts                      Auth.js(NextAuth) 설정 골격
prisma/
  schema.prisma                최소 골격(User/Role + Auth.js 표준 모델)
prisma.config.ts               Prisma 7 설정(연결 URL·마이그레이션)
```

## 로컬 개발

```bash
# 1) 의존성 설치 (이미 설치됨)
npm install

# 2) 환경변수
cp .env.example .env.local
#   - DATABASE_URL / DATABASE_URL_UNPOOLED (Neon)
#   - AUTH_SECRET                          (npx auth secret)
#   - ALLOWED_EMAIL_DOMAIN / MASTER_ADMIN_EMAIL

# 3) Prisma 클라이언트 생성
npm run prisma:generate

# 4) (Neon 준비 후) 마이그레이션
npm run prisma:migrate

# 5) 개발 서버
npm run dev          # http://localhost:3000  → /engine 으로 랜딩
```

> **DB·AUTH 미구성에서도 구동된다.** `DATABASE_URL` 없으면 Prisma 는 null,
> `AUTH_SECRET` 없으면 인증 비활성. `/api/health` 가 구성여부를 boolean 으로 보고.

## 명령어

| 명령 | 용도 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | TypeScript 타입체크 |
| `npm run lint` | ESLint |
| `npm run prisma:generate` | Prisma 클라이언트 생성 |
| `npm run prisma:migrate` | 마이그레이션(dev) — `DATABASE_URL_UNPOOLED` 필요 |
| `npm run prisma:deploy` | 마이그레이션(운영) |
| `npm run prisma:studio` | Prisma Studio |
| `npm run hooks:install` | git pre-commit 시크릿 스캔 훅 등록(`core.hooksPath .githooks`) |
| `npm run secret-scan` | 스테이징 변경 시크릿 스캔 1회 실행 |

## 다음 단계 (이 골격 위에)

1. **아키텍처 문서 확정**(`opr-system-architect`) → `prisma/schema.prisma` 전체 모델
   (fact_kanban · dim_class · agg_engine 뷰 · fact_store · fact_product_cum +
   입력면 annotation/target/cost_input/store_master). 설계 §6 데이터 계약.
2. **인증 메일 시스템 확정** → `src/auth.ts` providers 채움(회사 SSO / OTP / 매직링크).
3. **SAP RAW 업로드 + ETL**(참조 피킹앱 `OPR_Logistic_auto` 업로드 패턴 — 코드 미수정, 패턴만).
4. **출력면**: ① 엔진 드릴다운 트리테이블(메인) → KPI 카드 → 차트. → ② → ③ 순(설계 §7 Q3).
5. **입력면 + RBAC 강제**(VIEWER/USER/ADMIN, 마스터=env).

## 보안·규율

- 시크릿 하드코딩 금지 — 전부 env. `.env*` 는 `.env.example` 만 커밋.
- 외부 공유물 마스킹(점포 `00점`·브랜드 `[브랜드]`·실수치 `0.0억`). 실데이터 로컬만.
- 로그인 도메인 제한 — 명시 allow 없으면 전원 차단(안전한 기본값).
- 내부 도구. 외부 배포 금지.

### 시크릿 커밋 차단 훅 (권장 — 클론 직후 1회)

```bash
npm run hooks:install   # git config core.hooksPath .githooks
```

- 매 커밋 전 스테이징 변경을 스캔해 시크릿 유출을 차단한다(`scripts/precommit-secret-scan.sh`).
- `.env` 류 파일 스테이징 즉시 차단(`.env.example` 만 허용).
- [gitleaks](https://github.com/gitleaks/gitleaks) 설치 시 정밀 스캔(`.gitleaks.toml` = 기본 룰셋
  + Neon `npg_`/Vercel `vcp_`/`AUTH_SECRET`/`SMTP_PASS` 추가 룰). 미설치 시 경량 정규식 폴백.
- 오탐이면 `git commit --no-verify`(실 시크릿이 아님을 확인 후, 남용 금지).
- ⚠️ 훅은 우발 커밋 방어용 보조 장치다 — `.gitignore`(`.env*`) 가 1차 방어. 평문 운영 시크릿은
  로컬 `.env` 에 두지 말고 Vercel 환경변수/시크릿 매니저로 이관 권고.
