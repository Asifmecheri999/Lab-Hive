# Lab Hive — Testing

Two layers, both run entirely against the **local miniflare D1** (`wrangler dev`) — they
**never touch staging or production**:

| Layer | Tool | What it covers |
|---|---|---|
| **API** | Vitest + a real `wrangler dev` | Every critical Hono route: happy path, unauthorized (no token / wrong role), invalid input, and tenant isolation. |
| **E2E** | Playwright (Chromium) | The critical browser paths: login → dashboard, the faculty + student main workflows, and a multitenancy check (tenant A never sees tenant B's data). |

> Why integration (a running `wrangler dev`) instead of `@cloudflare/vitest-pool-workers`?
> Prisma 7's WASM query compiler doesn't resolve inside the pool (a documented known
> issue), but `wrangler dev` runs the real worker + real D1 cleanly. Bonus: the tests
> exercise the actual deployed behaviour (routing, auth, Prisma, D1), not a stand-in.

## One-time setup
```bash
npm install                       # root (api + packages workspaces)
cd web && npm install && cd ..    # web is a separate workspace
npx playwright install chromium   # download the browser E2E uses (~1 time)
```

## Commands (run from the repo root)
```bash
npm test          # API tests: seeds local D1 → boots wrangler dev (:8788) → runs Vitest
npm run test:e2e  # E2E: seeds local D1 → Playwright boots wrangler dev + next dev → runs specs
npm run test:all  # both, in order
```
`npm test` and `npm run test:e2e` are **self-contained** — they seed the database and start
the servers for you (via `start-server-and-test` and Playwright's `webServer`), then shut
them down. You do **not** need `npm run dev` running first.

## How it works
- **Seed** (`api/test/seed-test.sql`, idempotent) creates two tenants (A, B) and users
  (admin/faculty/student in A, an admin in B). Password for all: `password123`.
- **API tests** boot `wrangler dev` on **:8788** and hit it over HTTP. Tokens are minted in
  `api/test/helpers.ts` with the same JWT algorithm + the dev `AUTH_SECRET`, so they verify
  inside the worker. Files: `api/test/*.test.ts`.
- **E2E** (`playwright.config.ts`) boots **two** servers: the API on :8788 and `next dev` on
  :3000 **pointed at the :8788 API** (`NEXT_PUBLIC_API_URL`/`API_URL` overridden), so a test
  run can never reach production. Specs: `e2e/*.spec.ts`.

## What's covered
**API (`api/test/`)** — 10 tests:
- `health.test.ts` — `/api/health` (DB connectivity).
- `auth.test.ts` — login happy path, wrong password (401), unknown email (401), missing field (400).
- `protected.test.ts` — `GET /api/users`: admin happy path + **tenant isolation**, no token (401),
  wrong role/student (403); `POST /api/users` invalid input (400); **cross-tenant** `PUT /api/users/:id` (404).

**E2E (`e2e/`)** — 5 tests:
- `login.spec.ts` — login → dashboard; wrong password shows an error and stays on login.
- `admin.spec.ts` — admin's Users page shows own-tenant users and **never** tenant B's (multitenancy).
- `workflows.spec.ts` — faculty reach Requests → open the RA submission form; student reach
  Requests → open a new job request.

## Adding a test
- **API:** copy a block in `api/test/protected.test.ts`. Use `api(path, init, token)` and
  `tokenFor(USERS.<role>)` from `api/test/helpers.ts`. Assert the status + shape.
- **E2E:** add a `*.spec.ts` under `e2e/`, `await login(page, CREDS.<role>)`, then drive the UI
  with role/text locators. Keep them resilient (avoid brittle CSS selectors).

## Pre-deploy checklist (from DEPLOYMENT.md)
```
[ ] npm test          # API green
[ ] npm run test:e2e  # E2E green
[ ] then deploy to staging → verify → production   (see DEPLOYMENT.md)
```

## Troubleshooting (Windows)
- **`EBUSY` / port already in use / a test hangs on startup:** a previous `workerd`
  (miniflare) is still running. Kill it and retry:
  ```powershell
  Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
  ```
- **E2E fails at "dashboard loads":** the seed must set `acceptedPolicyVersion` to the current
  `POLICY_VERSION` in `api/src/routes/auth.ts`; if you bump that policy string, update
  `api/test/seed-test.sql` to match, or test users get stuck on the privacy-consent screen.
- **First run is slow:** `next dev` compiles on first hit and `wrangler dev` cold-starts — the
  Playwright `webServer` timeout (120s) accounts for this.
- **Fresh checkout with no local D1 schema:** run `npm run db:apply:local` once so the local
  D1 has the tables before seeding.

---

# Pilot-readiness manual checklist

Run this by hand before opening the pilot to a real customer (and after any large change).
Do it as **two personas in two different tenants** (say Tenant A `admin.a@…` and Tenant B
`admin.b@…`, plus a `student`/`faculty` in A) so you exercise both role gates and tenant
isolation. Tick each box; anything that 500s, hangs, or shows another tenant's data is a
blocker.

Legend: 🔓 public · 👤 any logged-in user · 🧑‍🔬 lab team (tech/coord/manager+admin) ·
✅ approvers · 🛡️ admin · ⭐ platform owner (super admin).

## 1. Every route / page

### Public & auth
| Page | Check |
|---|---|
| 🔓 `/` (landing) | Loads with no login; every section renders; "Sign in" / CTA links work; no console errors. |
| 🔓 `/login` | Valid creds → `/dashboard`; wrong password → inline error, stays on page; already-logged-in visitor is redirected to `/dashboard`; loading spinner while submitting. |
| 🔓 `/contact` | Submit reaches `info@` inbox; empty/invalid email rejected; success confirmation shown. |
| 👤 `/privacy` | Renders the current policy; version matches `POLICY_VERSION`. |

### Core (every logged-in user)
| Page | Check |
|---|---|
| 👤 `/dashboard` | Role-appropriate tiles/counts load; numbers match the data; no tile errors on a brand-new account. |
| 👤 `/getting-started` | Onboarding checklist renders; links jump to the right module. |
| 👤 `/agent` | Assistant answers from own-tenant data only; returns working links; never references another tenant's records. |
| 👤 `/support` | Renders; contact/help links valid. |
| 👤 `/requests` | Student: "+ New request" opens the job-request dialog, submit creates it, status shows Pending. Faculty: RA Submission tab + approve/reject a student request for their module; decision history opens read-only. |
| 👤 `/schedule` | Weekly timetable renders; booking a free slot works; **clash detection** blocks an overlapping booking (409). |
| 👤 `/timetable` | Term entries list; import/add entry works; no clash slips through. |

### Lab team (+ admin)
| Page | Check |
|---|---|
| 🧑‍🔬 `/inventory` | List loads (own tenant only); add/edit/delete an item; low-stock filter; consume drops stock + posts OPEX; plan-limit message when over cap. |
| 🧑‍🔬 `/maintenance` | Schedules list with **overdue** flag; add a log; attachments upload to R2. |
| 🧑‍🔬 `/experiments` | Experiments list; linked items resolve; item count badge correct. |
| 🧑‍🔬 `/activities` | List + **(count)** badge = number of activities; open one; linked items resolve. |
| 🧑‍🔬 `/issuances` | List + **(count)** badge; check-out/return flow; unlinking a deleted item doesn't crash. |
| 🧑‍🔬 `/facilities` | Labs/rooms list; add/edit a lab; belongs to own tenant. |
| 🧑‍🔬 `/vendors` | Supplier register; add/edit; approval status toggles. |
| 🧑‍🔬 `/safety` | Safety-doc library (download from R2); PPE requests approve/reject. |
| 🧑‍🔬 `/docs` | Searchable library; upload + public download link works. |

### Approvals & finance
| Page | Check |
|---|---|
| ✅ `/approvals` | Only own-tenant pending items; approve/reject moves it down the chain; history readable, not editable. |
| 🧑‍🔬 `/procurement` | Create request → approval chain → export PDF; CAPEX/OPEX tagging; quotes/invoices upload. |
| ✅ `/capex` | Budget vs actuals; CAPEX assets list; figures reconcile with procurement. |
| ✅ `/finance` | Procurement→budget-year, equipment→CAPEX, consume→OPEX all roll up; currency = AED; no cross-tenant totals. |
| 👤 `/analytics` | Dashboards render; every metric is own-tenant only. |

### Admin & platform
| Page | Check |
|---|---|
| 🛡️ `/users` | Lists own-tenant users **only** (never another tenant's); create/edit/deactivate; can't set a user's tenant to someone else's; plan user-cap enforced. |
| 🛡️ `/organisation` | Campus→school→dept→lab hierarchy; add/edit; plan hierarchy caps enforced. |
| 🛡️ `/plan` | Current plan/trial status; limits shown; upgrade CTA. |
| ⭐ `/platform` | **Super-admin only** — a normal admin is blocked/redirected; tenant list is the only intentionally cross-tenant view. |

## 2. Auth & session edge cases
- [ ] **Logged-out → protected route:** open `/inventory` (or any `(app)` route) with no session → redirected to `/login`, not a blank/500.
- [ ] **Expired / invalid session:** tamper the token (or wait past expiry) → API returns `401` → app bounces to `/login`; no infinite redirect loop.
- [ ] **Wrong-tenant by URL/id manipulation:** as Tenant A, take a record id that belongs to Tenant B and hit `GET/PUT/DELETE /api/<module>/<B-id>` → **`404` (never 200)**. Repeat for inventory, requests, procurement, maintenance, docs, vendors, experiments, activities, issuances. *(This is the one that must never fail — see §Automated + the isolation audit.)*
- [ ] **Role escalation:** as a student, call a lab-team/admin route (e.g. `POST /api/inventory`, `GET /api/users`) → `403`.
- [ ] **Paused / expired trial:** set the tenant `status='expired'` → every authed request returns `403 trial_expired` with the reactivate message; super admin is exempt.
- [ ] **Privacy-policy gate:** a user whose `acceptedPolicyVersion` ≠ current `POLICY_VERSION` sees the consent screen before the app shell; accepting clears it.
- [ ] **Account switch:** switching accounts fully swaps token + tenant (no stale data from the previous account; no "fetch error").

## 3. Empty states (brand-new tenant, zero data)
Create a fresh tenant with one admin and **no** other data, then open each module — each must
show a friendly empty state (not a spinner-forever, not a crash, counts read `0`):
- [ ] Dashboard (all tiles show 0 / "nothing yet")
- [ ] Inventory · Maintenance · Experiments · Activities · Issuances · Facilities
- [ ] Requests · Approvals · Procurement · CAPEX · Finance · Analytics
- [ ] Vendors · Safety · Docs · Schedule · Timetable · Organisation · Users
- [ ] The AI assistant answers "no data yet" gracefully rather than erroring.

## 4. Form edge cases (run on the main create/edit forms: inventory, requests, procurement, users, vendors)
- [ ] **Empty submit:** submitting with required fields blank → inline validation, no network call / no `500`.
- [ ] **Very long inputs:** paste ~5,000 chars into a text field → saved or cleanly rejected, never a crash or truncated-mid-write.
- [ ] **Special characters:** `"'<script>alert(1)</script>`, emoji 🧪, unicode, and `%` / `;` / `--` → stored literally and rendered escaped (no XSS, no broken layout).
- [ ] **Numbers:** letters/negatives/huge values in quantity/price fields → rejected or coerced sanely (no `NaN` written).
- [ ] **Double-click / double-submit:** rapidly click Save twice → exactly **one** record created (double-submit guard), button disables while in flight.
- [ ] **File uploads:** wrong type and oversized file → rejected with a message, not a hang; happy-path upload lands in the right R2 path.
- [ ] **Back/refresh mid-flow:** refreshing a half-filled form or navigating back doesn't leave a partial/orphaned record.
