# Hunter multi-user architecture (Phase 1)

Owner admin: **imrn.dev@gmail.com** (`ADMIN_EMAIL`, case-insensitive).

## Tenancy

All mutable Redis state is prefixed by user id:

| Key | Contents |
|---|---|
| `hunter:user:{id}` | User JSON (email, passwordHash, role, …) |
| `hunter:users:byEmail` | Hash email → userId |
| `hunter:u:{userId}:companies` | CompanyProfile[] JSON |
| `hunter:u:{userId}:visited` | Set of job ids |
| `hunter:u:{userId}:status` | Hash jobId → KanbanStatus |
| `hunter:u:{userId}:profile` | UserProfile (resumeText, targetRoles, …) |
| `hunter:u:{userId}:usage` | `{ bytesUsed, updatedAt }` |
| `hunter:u:{userId}:billing` | BillingAccount |

**Global job data** (`data/jobs.json`, `data/daily/*.json`, `data/fetches.json`) remains shared — Daily / Board / Kanban still load jobs globally. Only Redis mutable state is per-user.

### One-time migration

On admin login, if `hunter:migrated:v1` is unset and global `hunter:companies` / `hunter:visited` / `hunter:status` exist, they are **copied** into the admin user keys. Globals are not deleted.

## Auth

- Register / login with email + password (PBKDF2-SHA256, 100k iterations, Web Crypto).
- Session cookies (httpOnly, SameSite=lax):
  - `hunter_uid` — user id
  - `hunter_session` — HMAC-SHA256(`hunter:uid:{userId}`, secret)
- Secret: `AUTH_SECRET` or fallback `SITE_PASSWORD`.
- Middleware requires a valid session (except `/login`, `/register`, `/api/auth/*`).
- Dev soft-open: if neither secret is set and `NODE_ENV !== production`, routes are allowed with a warning.

### Admin

- Email matching `ADMIN_EMAIL` (default **imrn.dev@gmail.com**) → `role: admin`.
- Entitlements: **unlimited companies** + **10 MB** storage (not infinite storage).
- Legacy: POST `/api/auth/login` with `{ password }` only (SITE_PASSWORD) creates/logs into the admin user for `ADMIN_EMAIL` (required in prod for this path).
- Bootstrap: if `ADMIN_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` are set, first boot creates the admin user in Redis.

## Plans / entitlements

Simpler model stored on `billing`:

- `companyPlan`: `free` (10) | `cos_20` (20) | `cos_45` (45) | `cos_100` (100) | `unlimited` (admin)
- `storagePlan`: `free` (2 MB) | `plus` (10 MB) | `unlimited` (maps to 10 MB for admin)

| Plan id | maxCompanies | maxStorageBytes | Display price |
|---|---|---|---|
| free | 10 | 2 MB | $0 |
| cos_20 | 20 | (keep storage plan) | $5 |
| cos_45 | 45 | (keep storage plan) | $10 |
| cos_100 | 100 | (keep storage plan) | $20 |
| storage_plus | — | 10 MB | $10 |
| admin | ∞ | 10 MB | — |

### Enforcement

- Company add when `count >= maxCompanies` → `402` `{ error: 'PLAN_LIMIT', kind: 'companies', limit, used }`
- Writes that would exceed storage → `402` `{ error: 'QUOTA_EXCEEDED', kind: 'storage', limit, used }` with message *Free tier maxxed out. Continue for $10/mo*
- `bytesUsed` ≈ UTF-8 length of companies + profile + status + visited JSON; recomputed on each write.

## APIs

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name? }` |
| POST | `/api/auth/login` | `{ email, password }` or legacy `{ password }` |
| POST | `/api/auth/logout` | Clears cookies |
| GET | `/api/me` | user + entitlements + usage + billing |
| GET/POST/PUT/DELETE | `/api/companies` | User-scoped; enforces limits |
| GET/PATCH | `/api/state` | User-scoped visited/status |
| GET/PUT | `/api/profile` | Resume + target roles |
| GET | `/api/billing/plans` | Catalog JSON |
| POST | `/api/billing/checkout` | **501** stub |
| POST | `/api/billing/webhook` | **501** stub |

## Stripe plug-in points (Phase 2)

1. Replace checkout stub: create Stripe Checkout Session from `planId`, set `stripeCustomerId` / `stripeSubscriptionId` / `stripePriceIds` on `billing`.
2. Webhook: handle `checkout.session.completed`, `customer.subscription.updated|deleted` → update `companyPlan` / `storagePlan` / `status` / `currentPeriodEnd`.
3. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price id map.
4. No real payments in Phase 1 — UI shows “Coming soon” and calls the 501 stub.

## Env vars

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Prod recommended | HMAC session secret |
| `ADMIN_EMAIL` | Prod | `imrn.dev@gmail.com` |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Seed admin on first boot |
| `SITE_PASSWORD` | Legacy | Fallback secret + password-only admin login |
| `UPSTASH_REDIS_REST_URL` | Yes (multi-user) | |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (multi-user) | |

## Phase 2 (out of scope)

- Per-user job fetching pipelines
- True PDF parsing quality
- Stripe SDK + live checkout
- Email verification
