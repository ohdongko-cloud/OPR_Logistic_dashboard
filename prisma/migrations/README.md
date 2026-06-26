# Prisma 마이그레이션 — 적용 보류 상태 (Neon 미구성)

`20260626111958_init/migration.sql` 는 **전체 데이터 모델 초기 마이그레이션**이다.
`prisma migrate diff --from-empty --to-schema` 로 **파일만 생성**(=`--create-only` 등가)했고,
**아직 DB에 적용하지 않았다**(Neon `DATABASE_URL`/`DATABASE_URL_UNPOOLED` 미설정).

## 포함 (13 테이블 · 8 enum · 17 인덱스 · 10 FK)

- 코어 8: `snapshots` · `raw_rows` · `fact_kanban` · `dim_class` · `annotations`
  · `users` · `tab_permissions` · `ingest_logs`
- fast-follow 자리 2: `fact_store` · `fact_product_cum` (아키텍처 §1 — 스키마만)
- Auth.js 3: `accounts` · `sessions` · `verification_tokens`

## Neon 준비 후 적용 절차

```bash
# 1) .env.local 에 Neon 연결 주입 (.env.example 참고)
#    DATABASE_URL          (pooled, '-pooler')
#    DATABASE_URL_UNPOOLED (direct)

# 2) 적용 (운영/스테이징)
npx prisma migrate deploy

# 3) (선택) 로컬 개발 — 셰도DB로 정합성 재검증
npx prisma migrate dev --name init
```

> ⚠️ `migrate deploy` 는 이 SQL 을 그대로 실행한다. 적용 전 Neon 연결·백업 확인.
> 롤백 = `prisma migrate diff --from-schema ... --to-empty` 로 역방향 SQL 생성(파괴적, 확인 후).
