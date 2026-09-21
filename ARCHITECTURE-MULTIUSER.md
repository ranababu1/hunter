# Hunter multi-user architecture (Phase 2)

Owner admin: **imrn.dev@gmail.com** (`ADMIN_EMAIL` env **or** hardcoded fallback, case-insensitive).

## Tenancy

All mutable Redis state is prefixed by user id:

| Key | Contents |
|---|---|
| `hunter:user:{id}` | User JSON (email, passwordHash, role, phone, onboardingCompletedAt?, …) |
| `hunter:users:byEmail` | Hash email → userId |
| `hunter:users:ids` | Set of user ids (admin Users table; backfilled from byEmail if empty) |
| `hunter:u:{userId}:companies` | CompanyProfile[] JSON |
| `hunter:u:{userId}:visited` | Set of job ids |
| `hunter:u:{userId}:status` | Hash jobId → KanbanStatus |
| `hunter:u:{userId}:profile` | UserProfile (resumeText, targetRoles, locations?, experienceLevel?, phone?, …) |
| `hunter:u:{userId}:usage` | `{ bytesUsed, updatedAt }` |
| `hunter:u:{userId}:billing` | BillingAccount |
| `hunter:u:{userId}:fetchRuns` | FetchRun[] JSON (newest first; trimmed to `maxFetchHistory`) |
| `hunter:u:{userId}:lastFetchDate` | `YYYY-MM-DD` (Asia/Calcutta) for cadence |
| `hunter:rl:{scope}:{ip|email}` | Rate-limit counters (INCR + EXPIRE), auto-expire with the window |
| `hunter:u:{userId}:jobs` | Consolidated Job[] for that tenant |
| `hunter:u:{userId}:daily:{YYYY-MM-DD}` | DailyDigest JSON for that IST date |
| `hunter:u:{userId}:dailyDates` | Set of digest dates (list index) |
| `hunter:migrated:jobs:v1` | Flag: seed `data/*.json` copied into the admin tenant |

**Job data is strictly per tenant.** Daily / Board / Kanban / Fetches read only `hunter:u:{userId}:jobs`, `daily:{date}` and `fetchRuns`. There is **no fallback to `data/*.json`** for any user: a brand-new tenant sees an empty feed (`components/EmptyFeed.tsx`) until the morning ingest writes into *their* keys. The legacy files under `data/` are the owner's historical seed; `maybeMigrateSeedJobsToUser` copies them into the **admin** tenant once (`hunter:migrated:jobs:v1`), preferring already-ingested Redis jobs on id collisions, and turns `data/fetches.json` into a single `source: "seed"` FetchRun if the admin has no runs. Nothing else reads those files.

### One-time migration

On admin promote / login / `/api/me`, if `hunter:migrated:v1` is unset and global `hunter:companies` / `hunter:visited` / `hunter:status` exist, they are **copied** into the admin user keys. Globals are not deleted.

## Auth

- Register / login with email + password (PBKDF2-SHA256, 100k iterations, Web Crypto). `name` and `phone` are **required** on register (phone normalized to `+digits`, 7–15 digits; `400` otherwise).
- Session cookies (httpOnly, SameSite=lax, Secure in production, 30-day `Max-Age`):
  - `hunter_uid` — user id
  - `hunter_session` — **signed, expiring token** `v2.<expUnixSeconds>.<hmac>` where
    `hmac = HMAC-SHA256("hunter:uid:{userId}:{exp}", secret)`; implemented once in `lib/session-token.ts`
    (Web Crypto) and shared by `proxy.ts` and the Node route handlers.
  - Tokens are rejected when malformed, expired, signed for another uid, or signed with a different secret.
    Rotating `AUTH_SECRET` logs every tenant out. Legacy v1 (non-expiring) tokens are no longer accepted.
- Secret: `AUTH_SECRET` (deprecated fallback `SITE_PASSWORD`, kept only so old deploys without `AUTH_SECRET` keep working).
- `proxy.ts` (Next 16 rename of `middleware.ts`) requires a valid session for everything except
  `/`, `/about`, `/pricing`, `/contact`, `/api/contact`, `/login`, `/register`, `/api/auth/login|register`, `/api/ingest/*` (bearer-auth, validates itself), `_next`, favicon/icon. Invalid or expired cookies →
  `401` JSON for `/api/*`, else redirect to `/login?from=…&reason=expired`.
- `(app)/layout.tsx` additionally calls `requireUser()` server-side: a *validly signed* cookie whose user no
  longer exists (deleted account, wiped Redis) is redirected to `/login?reason=expired` instead of rendering
  an empty shell. Dev soft-open still applies.
- Dev soft-open: if neither secret is set and `NODE_ENV !== production`, routes are allowed with a warning
  and the unsigned `dev:{userId}` marker is accepted.

### Rate limiting (`lib/rate-limit.ts`)

Fixed-window counters in Redis (`INCR` + `EXPIRE`), **fail-open** when Redis is unavailable.

| Route | Key | Limit |
|---|---|---|
| `POST /api/auth/login` | per IP | 20 / 15 min |
| `POST /api/auth/login` | per email | 10 / 15 min |
| `POST /api/auth/register` | per IP | 5 / hour |

Over the limit → `429` `{ error: "<human message>", code: "RATE_LIMITED", retryAfterSeconds }` + `Retry-After` header.
Client IP comes from `x-forwarded-for` (first hop) then `x-real-ip`.

### Admin (promote-on-me)

- `isAdminEmail`: matches `ADMIN_EMAIL` env **or** hardcoded fallback `imrn.dev@gmail.com` (case-insensitive).
- `ensureAdminPrivileges(user)`: if admin email → set `role=admin`, upsert user, set billing to `adminBilling()`, run migration.
- Called from `requireUser` (all authenticated APIs), `getMePayload` (`GET /api/me`), login, and register.
- **Existing free accounts** with the admin email are promoted on next page load / `/api/me` without re-registering.
- Entitlements: **unlimited companies** + **10 MB** storage + **daily** fetches + **unlimited** fetch history.
- Bootstrap: if `ADMIN_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` are set, first boot creates the admin user in Redis.

## Tenant isolation guarantees

1. **Every** authenticated route handler and server page resolves the tenant from the session via
   `requireUser()` and reads/writes only `hunter:u:{user.id}:*`. No handler accepts a user id from the request.
2. Admin-only data (`/api/admin/users`, `/users`) is gated by `resolveEntitlements(...).isAdmin`, i.e. the
   `role` stored on the user record, never by a client-supplied flag.
3. In-memory cache keys are always `u:{userId}:{part}` (see *Caching model*), so one instance cannot serve
   another tenant's entry.
4. Global, read-only job data (`data/*.json`) is intentionally shared; nothing tenant-specific is written there.
5. Sessions are bound to a uid *and* an expiry; a leaked cookie is useless for another uid and dies after 30 days.

## Public site (`app/(marketing)`)

- Routes: `/` (home; authenticated visitors are redirected to `/daily`), `/about`, `/pricing` (renders `PLAN_CATALOG`), `/contact`.
- Shared `MarketingHeader` / `MarketingFooter`; header shows **Sign in / Start free**, or **Open app** when a session cookie is present.
- `POST /api/contact` (public, 5/hour per IP) stores messages in the Redis hash `hunter:contact:messages`; `GET /api/admin/contact` lists them (admin only). Contact address = `NEXT_PUBLIC_CONTACT_EMAIL` → `ADMIN_EMAIL` → hardcoded admin.
- The authenticated feed moved from `/` to **`/daily`**; login defaults to `/daily`, onboarding finishes at `/daily`.
- Positioning: Hunter is a structured job-hunt workspace (research, profiling, sorting, kanban tracking), not a regional or AI-only job search.

## Onboarding (blank-slate tenants)

- `User.onboardingCompletedAt` gates the app. `isOnboarded(user)` is true for admin or any user with the stamp.
- Register → `/onboarding` (standalone page, no app shell). Wizard steps: **Roles** (≥1) → **Preferences**
  (locations, experience level, optional resume text) → **Companies** (≥1, capped at `maxCompanies`) → **Review**
  → `POST /api/onboarding`.
- **Companies step** offers the top 10 global consulting firms (McKinsey, BCG, Bain, Deloitte, Accenture, PwC,
  EY, KPMG, Capgemini, IBM Consulting — `lib/onboarding-taxonomy.ts` `CONSULTING_PRESETS`) as one-click toggle
  chips with the careers URL prefilled, alongside free-text rows for any other company. Both contribute to the
  same plan-capped list; a manually typed name wins over a preset on a name collision.
- **Roles step** suggestion rail starts cross-functional (`DEFAULT_ROLE_SUGGESTIONS`) and, once a first role is
  entered, narrows to that role's family (tech, product, design, sales, marketing, finance, HR, consulting,
  operations, data, project/program) via `roleSuggestionsFor()`. The Experience-level select's top-tier label
  is similarly reworded per family (`experienceLevelsFor()`) — ids stay the canonical `EXPERIENCE_LEVELS` ids,
  only the leadership-tier label text changes, so no schema/storage change is involved.
- `(app)/layout.tsx` redirects un-onboarded tenants to `/onboarding`. Accounts that pre-date onboarding are
  grandfathered: if they already have companies or target roles the stamp is written lazily instead of
  redirecting.
- `/onboarding` itself redirects completed users to `/daily`.
- The wizard writes only to the caller's keys; company limit and storage quota return `402` with `field` so the
  UI can jump to the offending step.

## Resume upload (`lib/resume-extract.ts`, `lib/resume-limits.ts`)

- `POST /api/profile/resume` (multipart/form-data, one `file` field) — the only real file-upload surface in
  the app. `lib/resume-limits.ts` holds format/size constants shared with the client (pure, no Node built-ins,
  safe to import from `"use client"` code); `lib/resume-extract.ts` holds the actual parsers and must stay
  server-only (`pdf-parse` / `mammoth` / `word-extractor` pull in `fs`/`zlib`, which cannot bundle for the
  browser — importing it from a client component breaks the build).
- **Hard cap: 500 KB** (`MAX_RESUME_UPLOAD_BYTES`), enforced both client-side (before the upload even starts)
  and server-side (authoritative — a client check alone can't be trusted). Oversized files get `413` before
  any parsing is attempted.
- Accepted: `.pdf`, `.doc`, `.docx`, `.txt` (`ACCEPTED_RESUME_EXTENSIONS`), detected by extension first, mime
  type as fallback. Anything else → `400`.
- Extraction: `pdf-parse` (PDF), `mammoth` (DOCX), `word-extractor` (legacy OLE `.doc`), plain UTF-8 decode
  (`.txt`). A corrupt/password-protected/scanned-image file fails extraction gracefully → `422` with a
  specific message, never a crash.
- **pdf-parse worker gotcha**: `pdf-parse` v2 wraps pdf.js, which needs a worker script; Next's bundler
  relocates/transforms server code, breaking pdf.js's own relative worker lookup ("Setting up fake worker
  failed"). Fixed by (1) `next.config.ts` → `serverExternalPackages: ["pdf-parse"]` so Next ships it as a
  plain `node_modules` package instead of bundling it, and (2) importing `pdf-parse/worker`'s `getPath()` and
  calling `PDFParse.setWorker(getPath())` before any parse call.
- Extracted text is truncated to the same 200,000-char cap as pasted resume text, then goes through the normal
  storage-quota check (`checkStorageQuota` / `projectedBytesWithProfile`) before saving.

## Plans / entitlements
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

## Per-user fetches — live fetcher

- Redis `hunter:u:{userId}:fetchRuns` — `FetchRun[]` newest first.
- `FetchRun`: `{ id, runDate, createdAt, status, cadenceApplied, companiesChecked, jobsFound, notes?, issue?,
  source?, companyResults, pendingRetry?, retriesCompletedAt? }`.
- `POST /api/fetches/run` visits each active company's **real careers portal** (`lib/live-fetch.ts`), not a
  static catalog. For known ATS platforms it calls the same public JSON endpoint that platform's own careers
  page loads in a browser: Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co`), Ashby
  (`api.ashbyhq.com`), SmartRecruiters (`api.smartrecruiters.com`), Workday (`POST …/wday/cxs/{tenant}/{site}/jobs`
  — note: Workday 400s if `Accept-Language` carries RFC quality values like `en-US,en;q=0.9`; send a bare
  locale). Everything else gets a plain fetch with realistic browser headers, looking for schema.org
  `JobPosting` JSON-LD (the same markup search engines read). A response that looks like bot-blocking (403/429,
  or a Cloudflare/CAPTCHA/"access denied" body signature) is reported as an honest `error`, never faked as
  success. Newly found postings are merged by a stable content-hash id into the tenant's own `jobs` list
  (`lib/jobs.ts`) **and** upserted into today's daily digest, so Daily/Board/Kanban all reflect a manual run
  immediately.
- **What this deliberately does not do**: solve CAPTCHAs, spoof browser fingerprints to defeat anti-bot
  challenges, or rotate proxies to evade IP/rate-limit blocks. When a portal is genuinely blocking automated
  traffic that is surfaced to the user, not worked around.
- Transient failures (timeout/5xx/429) get up to 3 retries with backoff inside the request; companies still
  failing after that are retried once more via Next's `after()` **after the response is already sent** — a
  short best-effort second pass bounded by the same serverless invocation, not a durable background job (a
  real queue like Vercel Cron/QStash would be needed for retries that must survive minutes). The stored
  `FetchRun` gets `pendingRetry: true` until that pass finishes and rewrites it with `retriesCompletedAt`.
  `FetchesView` polls while `pendingRetry` is set and shows a toast once every checked company came back with a
  hit (or the ~80s poll ceiling lapses).
- **Gating** differs by plan:
  - Paid company plans (`cos_20/45/100`) and admin: unchanged cadence gate (`daily`), tracked via
    `lastFetchDate` — `canRunFetchToday` / `nextEligibleFetchDate`.
  - Free plan: a **manual click quota** instead of the cadence gate (`lib/fetch-quota.ts`) — `2` runs/day
    (IST), or `10`/day when the request carries `?fetch=more`. Tracked in
    `hunter:u:{userId}:manualFetches:{YYYY-MM-DD}` (`INCR` + 48h `EXPIRE`). Over quota → `429`
    `{ error: "MANUAL_FETCH_LIMIT", manualFetch: { count, limit, remaining, resetsAt } }`.
- `GET /api/fetches` returns `usesCadenceGate` (which gating mode applies) and, for free-plan tenants,
  `manualFetch` (today's count/limit/remaining). No seed/global fallback — the tenant's own run history, or
  nothing.

## Admin Users

- Nav **Users** (only if `entitlements.isAdmin`).
- Page `/users` + `GET /api/admin/users` (403 if not admin).
- Table: name, email, phone, plan labels, companies count, fetch runs count, bytesUsed, last fetch date, createdAt.
- **Edit** (`PATCH /api/admin/users/{id}`): name, phone, role, companyPlan, storagePlan. Refuses to demote the
  protected admin-email account away from `admin` (it would just be re-promoted on its next request anyway).
- **Delete** (`DELETE /api/admin/users/{id}`): permanently removes the user record, the email/id indexes, and
  every `hunter:u:{id}:*` key — companies, profile, billing, usage, fetch history, ingested jobs, every daily
  digest and the dailyDates index. Frees any storage the tenant was using. Blocked for self-delete and for any
  admin-role account (including the protected owner). Irreversible; the UI requires typing the target email to
  confirm.
- Full-bleed layout like companies / fetches.

## APIs

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name, phone }` — all required; phone normalized to `+digits`, 7–15 digits; **429** when rate-limited |
| POST | `/api/auth/login` | `{ email, password }` (both required); **429** when rate-limited |
| POST | `/api/auth/logout` | Clears cookies |
| GET | `/api/me` | user + entitlements + usage + billing; **promotes admin** |
| GET/POST/PUT/DELETE | `/api/companies` | User-scoped; enforces limits |
| GET/PATCH | `/api/state` | User-scoped visited/status |
| GET/PUT | `/api/profile` | Resume text (paste) + target roles + locations + experience level + phone/name |
| POST | `/api/profile/resume` | Resume **file** upload (PDF/DOC/DOCX/TXT, 500 KB cap) → server-side text extraction, saved onto the caller’s profile |
| GET/POST | `/api/onboarding` | GET status + plan limits; POST `{ targetRoles, locations?, experienceLevel?, resumeText?, companies:[{name, careersUrl?}] }` → saves profile + companies (plan/quota enforced), stamps `onboardingCompletedAt` |
| GET | `/api/fetches` | Per-user runs + cadence (no seed fallback) |
| POST | `/api/fetches/run` | Live fetch of active companies’ real portals; `?fetch=more` boosts the free-plan manual quota to 10/day |
| GET | `/api/admin/users` | Admin-only user table |
| PATCH | `/api/admin/users/{id}` | Admin-only edit: name/phone/role/companyPlan/storagePlan |
| DELETE | `/api/admin/users/{id}` | Admin-only permanent delete (blocked for self/admin accounts) |
| GET | `/api/admin/contact` | Admin-only contact-form inbox |
| POST | `/api/contact` | Public contact form → Redis; 5/hour per IP |
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
| `AUTH_SECRET` | Prod recommended | HMAC session secret; rotating it invalidates all sessions |
| `ADMIN_EMAIL` | Prod recommended | Defaults to hardcoded `imrn.dev@gmail.com` if unset |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Seed admin on first boot |
| `SITE_PASSWORD` | Deprecated | Session-secret fallback only; password-only admin login removed |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-user) | |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-user) | |
| `HUNTER_MEMORY_REDIS` | Dev/smoke only | `1` swaps Upstash for an in-process store (`lib/memory-redis.ts`); ignored whenever `VERCEL` is set |
| `HUNTER_INGEST_SECRET` | Morning publish | Bearer for `/api/ingest/daily` — never commit |


## Caching model (process-local)

In-memory cache in `lib/cache.ts` (Map + short TTL + simple LRU cap of 500 entries). The Map lives on `globalThis` because Next bundles pages and route handlers separately; without that, a mutation in `/api/*` could not invalidate the copy a page render reads (e.g. the layout would keep redirecting to `/onboarding` for up to 20s after completion). **Not** a Redis second layer — Redis remains the source of truth for mutable user data.

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

- Live career-portal crawler per tenant — shipped (Greenhouse/Lever/Ashby/SmartRecruiters/Workday adapters + schema.org JobPosting fallback, `lib/live-fetch.ts`); ingest path also still live for morning bulk publish
- A durable retry queue (Vercel Cron / QStash) for portals that stay down past the in-request retry window
- Remove `data/*.json` once the admin migration flag is confirmed set in prod
- Stripe SDK + live checkout
- Email verification
