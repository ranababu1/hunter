#!/usr/bin/env node
/**
 * Morning publish helper — POST today's digest + jobs into one tenant.
 *
 * Usage:
 *   HUNTER_INGEST_SECRET=... node scripts/publish-tenant.mjs payload.json
 *   HUNTER_INGEST_SECRET=... HUNTER_BASE_URL=https://hunter.imrn.dev \
 *     node scripts/publish-tenant.mjs payload.json
 *
 * Or raw curl:
 *
 *   curl -X POST https://hunter.imrn.dev/api/ingest/daily \
 *     -H "Authorization: Bearer $HUNTER_INGEST_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d @payload.json
 *
 * payload.json shape:
 * {
 *   "email": "imrn.dev@gmail.com",
 *   "date": "2026-09-21",
 *   "title": "Daily digest — Bengaluru AI / GenAI",
 *   "jobs": [ ...Job objects... ],
 *   "mergeJobs": true,
 *   "fetchRun": {
 *     "runDate": "2026-09-21",
 *     "status": "ok",
 *     "companiesChecked": 12,
 *     "jobsFound": 5,
 *     "companyResults": [ ...CompanyFetch objects... ]
 *   }
 * }
 *
 * Auth: Authorization Bearer HUNTER_INGEST_SECRET.
 * email defaults to ADMIN_EMAIL / imrn.dev@gmail.com when omitted.
 * Session-cookie auth also works (email ignored; uses logged-in user).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const secret = process.env.HUNTER_INGEST_SECRET;
const base =
  process.env.HUNTER_BASE_URL?.replace(/\/$/, "") ||
  "https://hunter.imrn.dev";
const file = process.argv[2];

if (!secret) {
  console.error("Set HUNTER_INGEST_SECRET");
  process.exit(1);
}
if (!file) {
  console.error("Usage: node scripts/publish-tenant.mjs payload.json");
  process.exit(1);
}

const body = readFileSync(resolve(file), "utf8");
const res = await fetch(`${base}/api/ingest/daily`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body,
});
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = text;
}
console.log(res.status, json);
if (!res.ok) process.exit(1);
