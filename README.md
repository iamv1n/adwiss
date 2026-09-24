# Adwise

Advertising analytics, automation and optimization for Meta Ads and Google Ads.
Product plan: [plan/plan.md](plan/plan.md).

## Layout

```text
cmd/
  api/        HTTP API (chi)
  worker/     background jobs + periodic schedules (asynq on Redis)
  migrate/    applies embedded migrations (goose)
internal/
  auth/           email/password auth, argon2id, server-side sessions
  organizations/  orgs, memberships, RBAC (owner/admin/member), invitations
  audit/          audit log writer
  queue/          queue names, priorities, task types
  store/          sqlc-generated queries (do not edit)
  platform/       config-free infrastructure: database, redis, http helpers, logging
  config/         environment configuration
db/
  migrations/     SQL migrations (goose format; also sqlc's schema source)
  queries/        SQL for sqlc
web/              Next.js frontend
deployments/      Dockerfile (and Terraform later)
```

## Local development

Requires Go 1.27+, sqlc, Docker, Node 24 and pnpm.

First-time setup:

```sh
cp .env.example .env      # then fill in META_APP_ID / META_APP_SECRET (and Google vars)
cd web && pnpm install && cd ..
make up                   # Postgres 17 + Redis 7 (docker compose)
make migrate
make seed                 # optional demo data; log in as demo@adwise.dev / demopassword1
```

Run the app — three terminals, all three must be running:

```sh
make api                  # API on :8080     (or: make dev-api    — live reload, needs air)
make worker               # background syncs (or: make dev-worker — live reload)
make web                  # web on :3000, proxies /api/* to the API
```

Open http://localhost:3000. The worker does all provider syncing: without it,
connecting an account works but no campaigns or metrics are ever pulled. It
syncs every active integration hourly, and on demand via
`POST /v1/orgs/{orgID}/integrations/{integrationID}/sync`.

Other commands:

```sh
make test                 # Go tests
make lint                 # go vet
make sqlc                 # regenerate internal/store after editing db/queries or migrations
make migrate-down         # roll back the last migration
make build                # binaries into bin/
make down                 # stop Postgres + Redis
```

### Meta: connected but nothing shows

- Check the worker is running (`make worker`).
- Meta only exposes the ad accounts you ticked on its consent screen. If your
  campaigns live in a Business Manager account, disconnect and reconnect, and
  select that business and ad account.
- A connected account with no campaigns (e.g. a personal ad account that has
  never run ads) syncs successfully but has nothing to show.
- Inspect what was synced:

  ```sh
  source .env
  psql "$DATABASE_URL" -c "select external_id, name, sync_enabled from ad_accounts where provider='meta'"
  psql "$DATABASE_URL" -c "select organization_id, count(*) from campaigns group by 1"
  ```

## Auth model

- Sessions are opaque 256-bit tokens. Only the SHA-256 hash is stored, in `sessions`.
- Browsers use the `adwise_session` cookie (HttpOnly, SameSite=Lax). The web app
  proxies `/api/*` to the API, so the cookie is first-party. API clients may send
  `Authorization: Bearer <token>`.
- Org-scoped routes live under `/v1/orgs/{orgID}/...`. Non-members get 404.
- Owners and admins manage members. Nobody can grant or manage a role above their
  own, and an organization always keeps at least one owner.
- Every state change writes an `audit_logs` row in the same transaction.
