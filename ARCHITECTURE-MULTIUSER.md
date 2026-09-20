# Hunter multi-user architecture (Phase 2)

Owner admin: **imrn.dev@gmail.com** (`ADMIN_EMAIL` env **or** hardcoded fallback, case-insensitive).

## Tenancy

All mutable Redis state is prefixed by user id:

| Key | Contents |
|---|---|
| `hunter:user:{id}` | User JSON (email, passwordHash, role, phone?, …) |
| `hunter:users:byEmail` | Hash email → userId |
| `hunter:users:ids` | Set of user ids (admin Users table; backfilled from byEmail if empty) |
| `hunter:u:{userId}:companies` | CompanyProfile[] JSON |
| `hunter:u:{userId}:visited` | Set of job ids |
| `hunter:u:{userId}:status` | Hash jobId → KanbanStatus |
| `hunter:u:{userId}:profile` | UserProfile (resumeText, targetRoles, phone?, …) |
| `hunter:u:{userId}:usage` | `{ bytesUsed, updatedAt }` |
| `hunter:u:{userId}:billing` | BillingAccount |
| `hunter:u:{userId}:fetchRuns` | FetchRun[] JSON (newest first; trimmed to `maxFetchHistory`) |
| `hunter:u:{userId}:lastFetchDate` | `YYYY-MM-DD` (Asia/Calcutta) for cadence |
| `hunter:u:{userId}:jobs` | Consolidated Job[] for that tenant |
| `hunter:u:{userId}:daily:{YYYY-MM-DD}` | DailyDigest JSON for that IST date |
| `hunter:u:{userId}:dailyDates` | Set of digest dates (list index) |

**Job data (hybrid):** morning ingest writes per-user `jobs` + `daily:{date}` in Redis. Daily / Board / Kanban **prefer user Redis data when non-empty**, else fall back to global `data/jobs.json` / `data/daily/*.json` so empty tenants keep working. `data/fetches.json` remains the shared career-portal catalog. Global files are **not** removed yet.

### One-time migration

On admin promote / login / `/api/me`, if `hunter:migrated:v1` is unset and global `hunter:companies` / `hunter:visited` / `hunter:status` exist, they are **copied** into the admin user keys. Globals are not deleted.

## Auth

- Register / login with email + password (PBKDF2-SHA256, 100k iterations, Web Crypto). Optional `phone` on register.
- Session cookies (httpOnly, SameSite=lax):
  - `hunter_uid` — user id
  - `hunter_session` — HMAC-SHA256(`hunter:uid:{userId}`, secret)
- Secret: `AUTH_SECRET` or fallback `SITE_PASSWORD`.
- Middleware requires a valid session (except `/login`, `/register`, `/api/auth/*`, `/api/ingest/*`).
- Dev soft-open: if neither secret is set and `NODE_ENV !== production`, routes are allowed with a warning.

### Admin (promote-on-me)

- `isAdminEmail`: matches `ADMIN_EMAIL` env **or** hardcoded fallback `imrn.dev@gmail.com` (case-insensitive).
- `ensureAdminPrivileges(user)`: if admin email → set `role=admin`, upsert user, set billing to `adminBilling()`, run migration.
- Called from `requireUser` (all authenticated APIs), `getMePayload` (`GET /api/me`), login, and register.
- **Existing free accounts** with the admin email are promoted on next page load / `/api/me` without re-registering.
- Entitlements: **unlimited companies** + **10 MB** storage + **daily** fetches + **unlimited** fetch history.
- Legacy: POST `/api/auth/login` with `{ password }` only (SITE_PASSWORD) creates/logs into the admin user for `ADMIN_EMAIL`.
- Bootstrap: if `ADMIN_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` are set, first boot creates the admin user in Redis.

## Plans / entitlements

Stored on `billing`:

- `companyPlan`: `free` (5) | `cos_20` (20) | `cos_45` (45) | `cos_100` (100) | `unlimited` (admin)
- `storagePlan`: `free` (2 MB) | `plus` (10 MB) | `unlimited` (maps to 10 MB for admin)

Extended entitlements (Phase 2):

| Field | Free | Paid company (cos_*) | Admin |
|---|---|---|---|
| `fetchCadence` | `alternate` | `daily` | `daily` |
| `maxFetchHistory` | 30 | ∞ | ∞ |
| `fetchEnabled` | true | true | true |
| `maxCompanies` | 5 | 20 / 45 / 100 | ∞ |
| `maxStorageBytes` | 2 MB | (keep storage plan) | 10 MB |

`storage_plus` alone does **not** change fetch cadence.

| Plan id | maxCompanies | maxStorageBytes | Display price |
|---|---|---|---|
| free | 5 | 2 MB | $0 |
| cos_20 | 20 | (keep storage plan) | $5 |
| cos_45 | 45 | (keep storage plan) | $10 |
| cos_100 | 100 | (keep storage plan) | $20 |
| storage_plus | — | 10 MB | $10 |
| admin | ∞ | 10 MB | — |

### Fetch cadence

- `canRunFetchToday(lastFetchDate, cadence, now=IST)` — calendar dates in **Asia/Calcutta**.
- **daily**: eligible if `lastFetchDate` is null or before today.
- **alternate**: at least **one full calendar day gap** (e.g. last Mon → next eligible Wed).
- Over-eager free user → `403` `{ error: 'FETCH_CADENCE', nextEligibleDate }`.

### Enforcement

- Company add when `count >= maxCompanies` → `402` `{ error: 'PLAN_LIMIT', kind: 'companies', limit, used }`
- Writes that would exceed storage → `402` `{ error: 'QUOTA_EXCEEDED', kind: 'storage', limit, used }` with message *Free tier maxxed out. Continue for $10/mo*
- `bytesUsed` ≈ UTF-8 length of companies + profile + status + visited + fetchRuns + jobs + daily digests JSON; recomputed on each write.
- Fetch history trimmed to `maxFetchHistory` (30 for free).

## Per-user fetches (Phase 2)

- Redis `hunter:u:{userId}:fetchRuns` — `FetchRun[]` newest first.
- `FetchRun`: `{ id, runDate, createdAt, status, cadenceApplied, companiesChecked, jobsFound, notes?, issue?, source?, companyResults }`.
- `POST /api/fetches/run` matches the user’s **active** companies + profile targetRoles / resume keywords against global `data/jobs.json` + portal metadata from `data/fetches.json` (honest source: `catalog` / `seed`). No external crawler on Vercel.
- Morning agent / `POST /api/ingest/daily` writes the **same FetchRun shape** (optional `fetchRun` in body).
- `GET /api/fetches` returns runs + cadence info + `nextEligibleDate`; empty history falls back to seed snapshot.

## Admin Users

- Nav **Users** (only if `entitlements.isAdmin`).
- Page `/users` + `GET /api/admin/users` (403 if not admin).
- Table: name, email, phone, plan labels, companies count, fetch runs count, bytesUsed, last fetch date, createdAt.
- Full-bleed layout like companies / fetches.

## APIs

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name?, phone? }` |
| POST | `/api/auth/login` | `{ email, password }` or legacy `{ password }` |
| POST | `/api/auth/logout` | Clears cookies |
| GET | `/api/me` | user + entitlements + usage + billing; **promotes admin** |
| GET/POST/PUT/DELETE | `/api/companies` | User-scoped; enforces limits |
| GET/PATCH | `/api/state` | User-scoped visited/status |
| GET/PUT | `/api/profile` | Resume + target roles + phone/name |
| GET | `/api/fetches` | Per-user runs + cadence + seed fallback |
| POST | `/api/fetches/run` | Cadence-enforced catalog match fetch |
| GET | `/api/admin/users` | Admin-only user table |
| GET | `/api/billing/plans` | Catalog JSON |
| POST | `/api/billing/checkout` | **501** stub (Stripe not integrated) |
| POST | `/api/billing/webhook` | **501** stub |


## Morning ingest (`POST /api/ingest/daily`)

Auth (either):

1. Session cookie (logged-in user) — body `email` ignored.
2. `Authorization: Bearer ${HUNTER_INGEST_SECRET}` + target `email` (body or `X-Hunter-Email`; default `ADMIN_EMAIL` / `imrn.dev@gmail.com`). Email must be the admin address or an existing user.

Body: `{ email?, date, title?, jobs: Job[], fetchRun?, mergeJobs? }` (`mergeJobs` default `true`).

Behavior: save `hunter:u:{id}:daily:{date}`; merge jobs into `hunter:u:{id}:jobs` by id (newer wins); optionally prepend `fetchRun` (respect `maxFetchHistory`); set `lastFetchDate`; `invalidateUser`; return `{ ok, userId, jobCount, dailyCount, fetchRunsCount }`.

Helper: `scripts/publish-tenant.mjs`.

## Stripe (still stubbed — not Phase 2)

1. Replace checkout stub: create Stripe Checkout Session from `planId`, set `stripeCustomerId` / `stripeSubscriptionId` / `stripePriceIds` on `billing`.
2. Webhook: handle `checkout.session.completed`, `customer.subscription.updated|deleted` → update `companyPlan` / `storagePlan` / `status` / `currentPeriodEnd`.
3. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price id map.
4. No real payments yet — UI shows “Coming soon” and calls the 501 stub.

## Env vars

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Prod recommended | HMAC session secret |
| `ADMIN_EMAIL` | Prod recommended | Defaults to hardcoded `imrn.dev@gmail.com` if unset |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Seed admin on first boot |
| `SITE_PASSWORD` | Legacy | Fallback secret + password-only admin login |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-user) | |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-user) | |
| `HUNTER_INGEST_SECRET` | Morning publish | Bearer for `/api/ingest/daily` — never commit |


## Caching model (process-local)

In-memory cache in `lib/cache.ts` (Map + short TTL + simple LRU cap of 500 entries). **Not** a Redis second layer — Redis remains the source of truth for mutable user data.

### Integrity guarantees

1. **Redis-first writes:** every mutation writes Redis (or fails) *before* `cacheSet` / `invalidateUser`.
2. **No writer-stale:** after a successful user mutation, `invalidateUser(userId)` drops all `u:{userId}:*` keys (including assembled `me`). Writers never leave their own stale entries.
3. **No cross-user bleed:** user keys are always `u:{userId}:{part}` via `userCacheKey`.
4. **TTL safety net** (multi-instance Vercel): even with invalidation, entries expire so other instances cannot serve stale data forever.

### TTLs

| Data | Key pattern | TTL |
|---|---|---|
| User / billing / usage / profile / companies / appState / fetchRuns / lastFetchDate / jobs / digests | `u:{userId}:*` | **20s** |
| Assembled `GET /api/me` payload | `u:{userId}:me` | **8s** |
| Static files (`jobs.json`, digests, `fetches.json`, daily dates) | `static:jobs:*` | **90s** |

### Client sharing

`MeProvider` (`components/MeProvider.tsx`) wraps `(app)/layout.tsx` and fetches `/api/me` **once**. Nav, Companies, Profile, Billing, Fetches consume context; mutations that change usage/entitlements call `refreshMe()`.

### HTTP

GET `/api/me`, `/api/companies`, `/api/fetches` set `Cache-Control: private, max-age=0, stale-while-revalidate=15` so the browser can briefly reuse while mutations still invalidate the server cache.

## Later

- Live career-portal crawler (ingest path already live)
- True PDF parsing quality
- Stripe SDK + live checkout
- Email verification
