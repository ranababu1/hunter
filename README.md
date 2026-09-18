# Hunter

Private job-tracking HQ for Bengaluru AI / GenAI roles. Dark editorial UI with daily digest, consolidated board, and kanban — backed by Upstash Redis for visited + status.

**Repo:** [github.com/ranababu1/hunter](https://github.com/ranababu1/hunter)

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Upstash Redis (`@upstash/redis`)
- Framer Motion + `@dnd-kit` for kanban

## Setup

```bash
cp .env.example .env.local
# edit SITE_PASSWORD, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without `SITE_PASSWORD`, middleware allows all routes (dev warning in logs).

## Vercel environment variables

| Variable | Required | Notes |
|---|---|---|
| `SITE_PASSWORD` | Yes (prod) | Login gate password |
| `UPSTASH_REDIS_REST_URL` | Recommended | Rest URL from Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Rest token from Upstash console |

Without Redis, visited/status APIs no-op gracefully (empty state).

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

## Branches

- **`main`** — incremental development; push daily data updates here.
- **Production deploys** — Vercel production tracks `main` (or your configured production branch). Preview deployments for PRs.

## Auth

- Cookie: `hunter_session` (httpOnly, sameSite=lax)
- Token = HMAC-SHA256 of the site password
- Protected: all routes except `/login` and `/api/auth/login`

## Scripts

```bash
npm run dev      # local
npm run build    # production build
npm run start    # serve build
npm run lint
```

## License

Private — for personal use.
