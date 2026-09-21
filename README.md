# Hunter

A structured job-hunt workspace. People lose months and money to unstructured searching and miss the right roles; Hunter does the work — research, profiling, sorting and kanban-style application tracking — in a private, per-account workspace. Public site at `/`, `/about`, `/pricing`, `/contact`; the app lives under `/daily`, `/board`, `/kanban`, `/companies`, `/fetches`, `/profile`, `/billing`.

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
# set AUTH_SECRET, ADMIN_EMAIL=imrn.dev@gmail.com, UPSTASH_*, HUNTER_INGEST_SECRET
# optional: ADMIN_BOOTSTRAP_PASSWORD

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register a free account (you will be walked through onboarding: desired roles, preferences, companies) or sign in as admin.

Without `AUTH_SECRET`, the proxy allows all routes in development only (warning in logs).

## Vercel environment variables

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Yes (prod) | Session HMAC secret |
| `ADMIN_EMAIL` | Yes (prod) | `imrn.dev@gmail.com` — case-insensitive admin |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Creates admin user on first boot |
| `SITE_PASSWORD` | Deprecated | Session-secret fallback only when `AUTH_SECRET` is unset; password-only login removed |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-user) | Rest URL from Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-user) | Rest token from Upstash console |
| `HUNTER_MEMORY_REDIS` | Local only | `1` = in-process store for dev/smoke tests; ignored on Vercel |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional | Address shown on `/contact`; defaults to `ADMIN_EMAIL` |
| `HUNTER_INGEST_SECRET` | Yes (morning publish) | Bearer secret for `POST /api/ingest/daily` — never commit |

Without Redis, visited/status/companies mutations return 503; APIs no-op gracefully where noted.

## Plans (Phase 2 — Stripe still stubbed)

| Plan | Companies | Storage | Fetches | Price (display) |
|---|---|---|---|---|
| Free | 5 | 2 MB | Alternate-day · 30 history | $0 |
| Companies 20 / 45 / 100 | 20 / 45 / 100 | — | Daily · unlimited history | $5 / $10 / $20 |
| Storage Plus | — | 10 MB | (no cadence change) | $10 |
| Admin (`ADMIN_EMAIL` or `imrn.dev@gmail.com`) | Unlimited | 10 MB | Daily · unlimited | — |

Billing UI + `/api/billing/checkout|webhook` remain **501 stubs** (Stripe not integrated).

## Daily / morning publish (per-tenant)

Two ways jobs reach a tenant now: (1) the tenant's own **Run fetch** button (`/fetches`), which visits their active companies' real careers portals live — see "Live fetcher" below; (2) push digests + jobs into **one user** via ingest (admin: `imrn.dev@gmail.com`), for morning bulk publish.

```bash
curl -X POST https://hunter.imrn.dev/api/ingest/daily \
  -H "Authorization: Bearer $HUNTER_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

`payload.json`:

```json
{
  "email": "imrn.dev@gmail.com",
  "date": "2026-09-21",
  "title": "Daily digest — Bengaluru AI / GenAI",
  "jobs": [],
  "mergeJobs": true,
  "fetchRun": {
    "runDate": "2026-09-21",
    "status": "ok",
    "companiesChecked": 12,
    "jobsFound": 5,
    "companyResults": []
  }
}
```

- Auth: Bearer `HUNTER_INGEST_SECRET` **or** logged-in session cookie.
- With bearer, `email` is required to target a user (defaults to `ADMIN_EMAIL` / `imrn.dev@gmail.com`); must be admin email or an existing user. Session auth ignores `email` and uses the session user.
- Writes Redis: `hunter:u:{userId}:daily:{date}`, merges into `hunter:u:{userId}:jobs`, optional `fetchRuns` + `lastFetchDate`.
- Helper: `node scripts/publish-tenant.mjs payload.json`
- **Strict tenancy:** Daily / Board / Kanban / Fetches read only the tenant’s own Redis keys. There is no fallback to `data/*.json`; a new account sees an empty feed until ingest runs for it. The legacy `data/` files are copied into the **admin** tenant once (`hunter:migrated:jobs:v1`) and are otherwise unused.

Job fields: `id`, `company`, `role`, `level`, `aiFocus`, `location`, `postedOrUpdated`, `match`, `url`, `whyMatch`, `dateSeen`, `isNew`.

## Live fetcher (`lib/live-fetch.ts`)

`POST /api/fetches/run` visits each active company's real careers portal instead of matching a static catalog:
Greenhouse, Lever, Ashby, SmartRecruiters and Workday get their own public job-board API call (the same data a
browser loads); everything else falls back to schema.org `JobPosting` structured data on the page. Bot-blocking
responses are reported honestly, not bypassed — no CAPTCHA solving, no fingerprint spoofing, no proxy rotation.
Transient failures retry in-request, then once more via `after()` after the response is sent; `FetchesView`
polls and toasts when a run finishes.

Free-plan tenants get a manual quota instead of the cadence gate: 2 runs/day, or 10/day with `?fetch=more` on
the run request. Paid plans and admin keep the existing daily cadence gate.

## Auth

- Cookies: `hunter_uid` + `hunter_session` (httpOnly, sameSite=lax, secure in prod, 30 days)
- Token = `v2.<exp>.<HMAC-SHA256("hunter:uid:{userId}:{exp}", AUTH_SECRET)>` — expiring and uid-bound (`lib/session-token.ts`)
- `proxy.ts` (Next 16 middleware) gates all non-public routes; `(app)/layout.tsx` re-checks the user exists
- Public: `/`, `/about`, `/pricing`, `/contact`, `/api/contact`, `/login`, `/register`, `/api/auth/login`, `/api/auth/register`, `/api/ingest/*` (bearer-auth, validates itself)
- Register requires name, email, phone (normalized to `+digits`, 7–15 digits) and an 8+ char password
- Login/register are rate-limited per IP / email via Redis (`429` + `Retry-After`)
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

## Caching

Process-local in-memory cache (`lib/cache.ts`) cuts Redis/file round-trips. Mutations always write Redis first, then invalidate `u:{userId}:*`. See **Caching model** in `ARCHITECTURE-MULTIUSER.md`.

