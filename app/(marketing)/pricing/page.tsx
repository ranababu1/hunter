import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MB, PLAN_CATALOG } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Hunter pricing",
  description:
    "Start free with five companies. Grow your watchlist to 20, 45 or 100 companies with daily fetches. Simple monthly pricing, no card to start.",
};

function mb(bytes: number | undefined): string {
  if (!bytes) return "";
  return `${Math.round(bytes / MB)} MB`;
}

const faqs = [
  {
    q: "Do I need a card to start?",
    a: "No. Every workspace starts on the Free plan with five companies, alternate-day fetches and thirty runs of history.",
  },
  {
    q: "What changes when I upgrade?",
    a: "A company plan raises how many careers portals Hunter watches and switches fetches to daily with unlimited history. Storage Plus raises the space for your resume and history without changing fetch cadence.",
  },
  {
    q: "When can I pay?",
    a: "Paid plans are being switched on shortly. Until then everyone runs on Free; you will see an upgrade button in Billing the moment checkout is live.",
  },
  {
    q: "Is my data shared between accounts?",
    a: "Never. Each workspace is isolated. Your companies, resume, digests and pipeline are visible only to you.",
  },
];

export default function PricingPage() {
  const companyPlans = PLAN_CATALOG.filter((p) => p.kind === "company");
  const storage = PLAN_CATALOG.find((p) => p.kind === "storage");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="fade-up max-w-2xl">
        <div className="eyebrow mb-4">Pricing</div>
        <h1 className="prose-title text-4xl leading-tight text-[var(--text)] sm:text-5xl">
          Start free. Pay only for a bigger watchlist.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--text-muted)]">
          Plans scale with the number of companies Hunter watches for you. The
          research, sorting and tracking are the same on every tier.
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {companyPlans.map((p) => {
          const free = p.id === "free";
          const featured = p.id === "cos_45";
          const daily = !free;
          return (
            <div
              key={p.id}
              className={
                featured
                  ? "relative rounded-2xl border border-[rgba(45,212,191,0.45)] bg-[var(--bg-elevated)] p-6 shadow-[0_0_0_1px_rgba(45,212,191,0.15)]"
                  : "rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6"
              }
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--bg)] px-2.5 py-0.5 text-[11px] text-[var(--accent)]">
                  Most popular
                </span>
              )}
              <div className="eyebrow">{free ? "Free" : `${p.maxCompanies} companies`}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular-nums text-[var(--text)]">
                  ${p.monthlyPriceUsd ?? 0}
                </span>
                <span className="text-sm text-[var(--text-dim)]">/ month</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-sm text-[var(--text-muted)]">
                {[
                  `Watch up to ${p.maxCompanies} companies`,
                  daily ? "Daily fetches" : "Alternate-day fetches",
                  daily ? "Unlimited fetch history" : "30 runs of fetch history",
                  free ? `${mb(p.maxStorageBytes)} storage` : "Keeps your storage plan",
                  "Daily digest, board and kanban",
                  "Private, isolated workspace",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={
                  featured || free
                    ? "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[#0d1117]"
                    : "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                }
                style={featured || free ? { background: "var(--accent)" } : undefined}
              >
                {free ? "Start free" : "Start free, upgrade later"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>

      {storage && (
        <div className="glass mt-6 flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="eyebrow">Add-on</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
              {storage.label} — {mb(storage.maxStorageBytes)}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Room for long resumes, large company lists and years of fetch
              history. Does not change how often Hunter fetches.
            </p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tabular-nums text-[var(--text)]">
              ${storage.monthlyPriceUsd}
            </span>
            <span className="text-sm text-[var(--text-dim)]">/ month</span>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-[var(--text-dim)]">
        Prices in USD. Paid checkout is being switched on shortly; every
        workspace starts on Free today.
      </p>

      <section className="mt-20 max-w-3xl">
        <div className="eyebrow mb-3">Questions</div>
        <h2 className="prose-title text-3xl text-[var(--text)]">Straight answers</h2>
        <dl className="mt-8 divide-y divide-[var(--border)]">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-semibold text-[var(--text)]">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
