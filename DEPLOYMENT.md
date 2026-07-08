# Lab Hive — Local / Staging / Production workflow

All-Cloudflare stack. **Correcting two things up front** (the code differs from the
usual assumptions):

- **Database is Cloudflare D1** (SQLite), accessed with a per-request Prisma client via
  `@prisma/adapter-d1`. **Not** Hyperdrive/Postgres — so there is no connection string or
  Hyperdrive config to manage. Each environment just points at a different D1 database.
- **The frontend is a Cloudflare *Worker*** (`labhive-web`, built with OpenNext), **not
  Cloudflare Pages**. So there are no automatic per-branch "Pages preview URLs". The
  equivalent here is a **stable `staging` Worker** on a `*.workers.dev` URL that always
  points at the staging API. You deploy a branch's build to staging to preview it.

## Environments

| Env | API worker | API URL | Web worker | Web URL | D1 database |
|---|---|---|---|---|---|
| **local** | `wrangler dev` | `http://localhost:8787` | `next dev` | `http://localhost:3000` | local (miniflare file) |
| **staging** | `labhive-api-staging` | `https://labhive-api-staging.your-account.workers.dev` | `labhive-web-staging` | `https://labhive-web-staging.your-account.workers.dev` | `labhive-staging` |
| **production** | `labhive-api` | `https://labhive-api.your-account.workers.dev` | `labhive-web` | `https://labsynch.com` | `labhive` |

Config lives in `api/wrangler.toml` and `web/wrangler.toml` as `[env.staging]` /
`[env.production]` blocks. The **top-level** config equals production (so your existing CI
and `wrangler dev` keep working unchanged).

> **Why `NEXT_PUBLIC_API_URL` appears both in wrangler.toml and in build commands:**
> `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**. So the API
> URL a browser calls is fixed by the env var present during `opennextjs-cloudflare build`,
> **not** by the runtime `[vars]`. Always build with the URL matching the env you deploy.
> (`API_URL`, used server-side, *is* read from `[vars]` at runtime.) There are no hardcoded
> API URLs left in the frontend — they all resolve through `web/src/lib/api-url.ts`, which
> reads `NEXT_PUBLIC_API_URL`.

---

## 1. One-time staging setup (do this once)

Run from the repo root unless noted. These use the `wrangler` CLI (which talks to the
Cloudflare API for you — no dashboard clicking needed except the optional custom domain).

```bash
# 1. Create the staging D1 database
cd api
npx wrangler d1 create labhive-staging
#   → copy the printed database_id and paste it into api/wrangler.toml:
#       [[env.staging.d1_databases]] database_id = "PASTE_STAGING_D1_ID_HERE"

# 2. Create the staging R2 bucket (keeps staging file uploads out of production)
npx wrangler r2 bucket create labhive-files-staging
cd ..

# 3. Apply the schema/migrations to the staging D1
npm run db:apply:staging          # wrangler d1 migrations apply labhive-staging --remote --env staging

# 4. Seed a starter admin into staging (same seed used for local)
npm run db:seed:staging           # wrangler d1 execute labhive-staging --remote --env staging --file=./seed.sql

# 5. Staging secrets (NOT in wrangler.toml). Use a DIFFERENT AUTH_SECRET from production
#    so staging tokens never validate on prod.
cd api
npx wrangler secret put AUTH_SECRET       --env staging   # long random string
npx wrangler secret put VAPID_PRIVATE_KEY --env staging    # reuse prod's value or a new pair
npx wrangler secret put ZEPTO_TOKEN       --env staging    # reuse prod's, or a test token
cd ../web
npx wrangler secret put AUTH_SECRET       --env staging    # NextAuth session secret (any long random string)
cd ..

# 6. First staging deploy (API first, then web — see section 3)
```

---

## 2. Local development (full stack)

D1 runs locally via miniflare — a real local database file under `.wrangler/state`, no cloud
DB touched.

```bash
# once per checkout / after schema changes
npm install
npm run db:generate            # generate the Prisma client
npm run db:apply:local         # apply migrations to the LOCAL D1
npm run db:seed:local          # seed local admin + sample data

# then start the stack (two terminals, in this order):
npm run dev:api                # API on http://localhost:8787 (wrangler dev, local D1)
cd web && npm run dev          # web on http://localhost:3000 (next dev)
#   — or, from the root, both at once:
npm run dev
```

`web/.env.local` must contain `NEXT_PUBLIC_API_URL=http://localhost:8787` (and
`API_URL=http://localhost:8787`) so the browser build and server-side calls hit your local
API. Health check: open `http://localhost:8787/api/health` → `{"status":"ok",...}`.

Dev logins after seeding: `student@ / faculty@ / admin@ example.edu`, password `password123`.

---

## 3. Deploy commands

### API (Cloudflare Worker)
```bash
# STAGING — migrate the staging DB, then deploy the staging worker
npm run db:apply:staging
npm run deploy:api:staging               # wrangler deploy --env staging

# PRODUCTION — migrate prod DB, then deploy prod worker
npm run db:apply:prod
npm run deploy:api:prod                  # wrangler deploy --env production
```

### Web (OpenNext Worker) — build with the matching API URL, then deploy
The API URL must be set **at build time**. Pick your shell:

```powershell
# STAGING (PowerShell)
cd web
$env:NEXT_PUBLIC_API_URL = "https://labhive-api-staging.your-account.workers.dev"
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --env staging
```
```bash
# STAGING (bash)
cd web
NEXT_PUBLIC_API_URL=https://labhive-api-staging.your-account.workers.dev npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --env staging
```
```powershell
# PRODUCTION (PowerShell)
cd web
$env:NEXT_PUBLIC_API_URL = "https://labhive-api.your-account.workers.dev"
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --env production
```

---

## 4. Git flow & CI

- **`main` → production (automatic).** Your existing GitHub Action
  (`.github/workflows/deploy.yml`) still runs on push to `main`: it applies migrations to
  the production D1 and deploys the production API + web. **Unchanged** — merging to `main`
  is your production release.
- **Feature branches → staging (manual).** Cloudflare Workers have no automatic per-branch
  preview like Pages. To preview a branch, deploy it to the **staging** worker with the
  commands in section 3, then open the staging URL. Staging is a stable, shared preview env.
- (Optional) If you want branch pushes to auto-deploy to staging, add a second workflow
  triggered on non-`main` branches running `npm run deploy:api:staging` + the staging web
  build/deploy. Ask and I'll write it.

---

## 5. Pre-deploy checklist (run top to bottom)

```text
[ ] 1. Locally: npm run dev  → click through the change, no console/network errors
[ ] 2. Build check:          cd web && npm run build     (must pass, catches type errors)
[ ] 3. API → staging:        npm run db:apply:staging && npm run deploy:api:staging
[ ] 4. Web → staging:        build with staging NEXT_PUBLIC_API_URL, then deploy --env staging
[ ] 5. Verify staging:       open the staging web URL, confirm it talks to the STAGING api
                             (check a request in devtools → host is *-staging.workers.dev)
[ ] 6. API → production:     npm run db:apply:prod && npm run deploy:api:prod
[ ] 7. Web → production:     build with prod NEXT_PUBLIC_API_URL, then deploy --env production
                             (or simply merge to main and let the CI do steps 6–7)
[ ] 8. Monitor:              npm run tail:api:prod        (live logs; watch for 5xx/timeouts)
```

## 6. Monitoring

```bash
npm run tail:api:staging     # wrangler tail --env staging
npm run tail:api:prod        # wrangler tail --env production
```
The API now emits a structured JSON error line (route, tenant, user, message, stack) for any
unhandled error, and every DB query is bounded to 8s — so hangs surface as a clean `504` in
the tail rather than a silent stall.

---

## Manual steps you must do in Cloudflare (summary)

Almost everything is CLI (which drives Cloudflare for you). The only true one-time actions:

1. **Create the staging D1:** `wrangler d1 create labhive-staging` → paste the `database_id`
   into `api/wrangler.toml` `[[env.staging.d1_databases]]`. *(dashboard alt: Workers & Pages →
   D1 → Create database)*
2. **Create the staging R2 bucket:** `wrangler r2 bucket create labhive-files-staging`.
   *(dashboard alt: R2 → Create bucket)*
3. **Set staging secrets** (CLI, section 1 step 5): `AUTH_SECRET`, `VAPID_PRIVATE_KEY`,
   `ZEPTO_TOKEN` on `labhive-api-staging`, and `AUTH_SECRET` on `labhive-web-staging`.
4. **(Optional) Staging custom domain:** if you'd rather use `staging.labsynch.com` than the
   `*.workers.dev` URL — Cloudflare dashboard → Workers & Pages → `labhive-web-staging` →
   Settings → Domains & Routes → Add custom domain. (Not required; the `.workers.dev` URL
   works out of the box because `workers_dev = true` in `[env.staging]`.)
5. **⚠ Production `AUTH_SECRET` — verify/rotate.** Today `AUTH_SECRET` is a plaintext
   placeholder in `api/wrangler.toml [vars]`, so a bare `wrangler deploy` sets that
   dev value on production. Set a real secret and prefer `--env production` (which does not
   ship the plaintext var):
   ```bash
   cd api && npx wrangler secret put AUTH_SECRET               # real random value on labhive-api
   ```
   Do this **before** switching production to `--env production`, or the plaintext var is
   removed with no secret behind it and logins break. Your current `main`→CI path (bare
   deploy) keeps working either way.

Nothing else needs the dashboard — no bindings to click-create, no Pages project, no
Hyperdrive.
