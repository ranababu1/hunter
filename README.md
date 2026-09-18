# Hunter

Private multi-user job-tracking HQ for Bengaluru AI / GenAI roles. Dark editorial UI with daily digest, consolidated board, and kanban — backed by Upstash Redis (per-user state).

**Repo:** [github.com/ranababu1/hunter](https://github.com/ranababu1/hunter)

**Admin:** `imrn.dev@gmail.com` (unlimited companies · 10 MB · daily fetches; auto-promoted on `/api/me`)

See [ARCHITECTURE-MULTIUSER.md](./ARCHITECTURE-MULTIUSER.md) for tenancy, plans, and Stripe plug-in points.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Upstash Redis (`@upstash/redis`)
- Framer Motion + `@dnd-kit` for kanban

## Setup

```bash
cp .env.example .env.local
# set AUTH_SECRET, ADMIN_EMAIL=imrn.dev@gmail.com, UPSTASH_*
# optional: ADMIN_BOOTSTRAP_PASSWORD, SITE_PASSWORD (legacy)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register a free account, or sign in as admin.

Without `AUTH_SECRET` / `SITE_PASSWORD`, middleware allows all routes in development only (warning in logs).

## Vercel environment variables

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Yes (prod) | Session HMAC secret |
| `ADMIN_EMAIL` | Yes (prod) | `imrn.dev@gmail.com` — case-insensitive admin |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Creates admin user on first boot |
| `SITE_PASSWORD` | Optional | Legacy password-only admin login + secret fallback |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-user) | Rest URL from Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-user) | Rest token from Upstash console |

Without Redis, visited/status/companies mutations return 503; APIs no-op gracefully where noted.

## Plans (Phase 2 — Stripe still stubbed)

| Plan | Companies | Storage | Fetches | Price (display) |
|---|---|---|---|---|
| Free | 5 | 2 MB | Alternate-day · 30 history | $0 |
| Companies 20 / 45 / 100 | 20 / 45 / 100 | — | Daily · unlimited history | $5 / $10 / $20 |
| Storage Plus | — | 10 MB | (no cadence change) | $10 |
| Admin (`ADMIN_EMAIL` or `imrn.dev@gmail.com`) | Unlimited | 10 MB | Daily · unlimited | — |

Billing UI + `/api/billing/checkout|webhook` remain **501 stubs** (Stripe not integrated).

## Daily JSON update flow

1. Morning bot (or manual research) produces a daily digest JSON.
2. Write `data/daily/YYYY-MM-DD.json` with shape:

```json
{
  "date": "2026-09-18",
  "title": "Daily digest — Bengaluru AI / GenAI",
  "jobs": [ /* Job objects */ ]
}
```

3. Merge / upsert into `data/jobs.json` (consolidated board source of truth).
4. Commit and push — Vercel rebuilds; Daily view picks the latest `data/daily/*.json` by filename.

Job fields: `id`, `company`, `role`, `level`, `aiFocus`, `location`, `postedOrUpdated`, `match`, `url`, `whyMatch`, `dateSeen`, `isNew`.

Jobs JSON remains **global**; Redis mutable state (companies, kanban, profile) is **per-user**.

## Auth

- Cookies: `hunter_uid` + `hunter_session` (httpOnly, sameSite=lax)
- Token = HMAC-SHA256 of `hunter:uid:{userId}` with `AUTH_SECRET` (or `SITE_PASSWORD`)
- Public: `/login`, `/register`, `/api/auth/login`, `/api/auth/register`
- Passwords: PBKDF2-SHA256 (Web Crypto)

## Scripts

```bash
npm run dev      # local
npm run build    # production build
npm run start    # serve build
npm run lint
```

## License

Private — for personal use.
