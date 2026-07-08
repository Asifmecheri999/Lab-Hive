# LabSynch

**Free, open-source lab management for research & university labs.** Inventory, scheduling, safety,
procurement and maintenance in one portal — instead of a wiki and a dozen spreadsheets.

Built by someone who has run engineering & research laboratories for over a decade.

> **Try it free:** [labsynch.com](https://labsynch.com) · **Self-host:** it's a Cloudflare Workers
> app — clone, set a few secrets, deploy (runs on the free tier) · **License:** MIT

<!-- Add a screenshot: docs/screenshot.png -->

## What's inside — 12 modules
Inventory & assets · Facilities · Experiments · Scheduling · Service requests · Safety ·
Procurement · Budgets (CAPEX/OPEX) · Vendors · Maintenance · Documents · AI assistant.

Each replaces a spreadsheet, a form, or an email thread — one login, one source of truth.

## Tech stack
- **Web** — Next.js (App Router) on Cloudflare via OpenNext
- **API** — Hono on Cloudflare Workers
- **Database** — Cloudflare D1 (SQLite) via Prisma
- **Files** — Cloudflare R2

## Run it locally
```bash
npm install
cp api/.dev.vars.example api/.dev.vars      # local secrets (placeholders are fine for dev)
npm run db:generate
npm run db:apply:local
npm run db:seed:local                        # optional sample data
npm run dev                                  # web → http://localhost:3000, api → http://localhost:8787
```
Dev logins after seeding: `admin@example.edu`, `faculty@example.edu`, `student@example.edu` — password `password123`.

## Deploy your own
Full guide: [DEPLOYMENT.md](DEPLOYMENT.md). Short version:
1. Create a Cloudflare **D1** database and **R2** bucket.
2. Copy `api/wrangler.toml.example` → `api/wrangler.toml` and `web/wrangler.toml.example` → `web/wrangler.toml`, and fill in your own ids / names / URLs.
3. Set secrets (never commit these): `wrangler secret put AUTH_SECRET` (plus `VAPID_PRIVATE_KEY` and an email token if you want push / email).
4. `npm run db:apply:remote`, then deploy the API and web workers.

Everything runs comfortably inside Cloudflare's **free tier**.

## Testing
See [TESTING.md](TESTING.md) — API integration tests (Vitest) + end-to-end tests (Playwright).

## Security
See [SECURITY.md](SECURITY.md). Please don't run security tests against the live labsynch.com instance without permission.

## Contributing
Issues and PRs are welcome. It's a tool one person built to make lab work easier — if it helps your lab too, great.

## Disclaimer
LabSynch is free and provided **as-is**, with no warranty (see [LICENSE](LICENSE)). It's a tool one person built and shares to help other labs — expect the occasional rough edge, and please keep your own backups of anything important. If you use the hosted instance at labsynch.com, treat it as a helpful assistant rather than your only system of record — I can't promise uptime, and I may not be able to run it forever. Found a bug or have an idea? Email **info@labsynch.com** or open an issue — I read every message.

---
MIT licensed. Not a company — a free tool, shared.
