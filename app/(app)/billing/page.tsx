"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes, PLAN_CATALOG } from "@/lib/plans";
import type { BillingAccount, PlanCatalogEntry } from "@/lib/types";
import { QuotaBanner } from "@/components/QuotaBanner";

type MePayload = {
  user: { email: string; role: string };
  entitlements: {
    companyPlan: string;
    storagePlan: string;
    maxCompanies: number;
    maxStorageBytes: number;
    isAdmin: boolean;
  };
  billing: BillingAccount;
  usage: { bytesUsed: number; updatedAt: string };
};

export default function BillingPage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [plans, setPlans] = useState<PlanCatalogEntry[]>(PLAN_CATALOG);
  const [companyCount, setCompanyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [mRes, pRes, cRes] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/billing/plans"),
        fetch("/api/companies"),
      ]);
      if (mRes.ok) setMe((await mRes.json()) as MePayload);
      if (pRes.ok) {
        const d = (await pRes.json()) as { plans: PlanCatalogEntry[] };
        setPlans(d.plans);
      }
      if (cRes.ok) {
        const d = (await cRes.json()) as { companies?: unknown[] };
        setCompanyCount(d.companies?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function checkout(planId: string) {
    setCheckoutMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json()) as { message?: string };
      setCheckoutMsg(data.message ?? `Checkout returned ${res.status}`);
    } catch {
      setCheckoutMsg("Network error");
    }
  }

  if (loading || !me) {
    return (
      <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Loading billing…
      </div>
    );
  }

  const maxC =
    me.entitlements.maxCompanies < 0
      ? "∞"
      : String(me.entitlements.maxCompanies);
  const pct = Math.min(
    100,
    Math.round(
      (me.usage.bytesUsed / Math.max(1, me.entitlements.maxStorageBytes)) * 100,
    ),
  );

  const companyPlans = plans.filter((p) => p.kind === "company");
  const storagePlans = plans.filter((p) => p.kind === "storage");

  return (
    <div className="mx-auto max-w-3xl space-y-6 fade-up">
      <div>
        <div className="eyebrow mb-2">Plans</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Billing</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Payments are not configured yet (Stripe stubs). Display prices only. Free = 5 companies · alternate-day fetches.
        </p>
      </div>

      <QuotaBanner
        bytesUsed={me.usage.bytesUsed}
        maxStorageBytes={me.entitlements.maxStorageBytes}
        companyCount={companyCount}
        maxCompanies={
          me.entitlements.maxCompanies < 0
            ? undefined
            : me.entitlements.maxCompanies
        }
      />

      <div className="glass space-y-4 p-6">
        <h2 className="prose-title text-xl">Current plan</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-dim)]">Account</dt>
            <dd className="text-[var(--text)]">{me.user.email}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-dim)]">Role</dt>
            <dd className="text-[var(--text)]">
              {me.entitlements.isAdmin ? "Admin" : "User"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-dim)]">Company plan</dt>
            <dd className="text-[var(--text)]">
              {me.entitlements.companyPlan} · {companyCount} / {maxC}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-dim)]">Storage plan</dt>
            <dd className="text-[var(--text)]">
              {me.entitlements.storagePlan} ·{" "}
              {formatBytes(me.usage.bytesUsed)} /{" "}
              {formatBytes(me.entitlements.maxStorageBytes)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-dim)]">Billing status</dt>
            <dd className="text-[var(--text)]">{me.billing.status}</dd>
          </div>
        </dl>

        <div>
          <div className="mb-1 flex justify-between text-xs text-[var(--text-dim)]">
            <span>Storage</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background:
                  pct >= 100
                    ? "var(--danger)"
                    : pct >= 90
                      ? "var(--good)"
                      : "var(--accent)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="prose-title text-xl">Company tiers</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {companyPlans.map((p) => (
            <div key={p.id} className="glass p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-[var(--text)]">{p.label}</h3>
                <span className="text-sm text-[var(--accent)]">
                  {p.monthlyPriceUsd === 0
                    ? "$0"
                    : p.monthlyPriceUsd != null
                      ? `$${p.monthlyPriceUsd}/mo`
                      : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {p.description}
              </p>
              {p.id !== "free" && (
                <button
                  type="button"
                  onClick={() => void checkout(p.id)}
                  className="mt-3 w-full rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[rgba(45,212,191,0.35)] hover:text-[var(--accent)]"
                >
                  Coming soon
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="prose-title text-xl">Storage</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {storagePlans.map((p) => (
            <div key={p.id} className="glass p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-[var(--text)]">{p.label}</h3>
                <span className="text-sm text-[var(--accent)]">
                  {p.monthlyPriceUsd != null
                    ? `$${p.monthlyPriceUsd}/mo`
                    : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {p.description}
              </p>
              <button
                type="button"
                onClick={() => void checkout(p.id)}
                className="mt-3 w-full rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[rgba(45,212,191,0.35)] hover:text-[var(--accent)]"
              >
                Coming soon
              </button>
            </div>
          ))}
        </div>
      </div>

      {checkoutMsg && (
        <p className="text-sm text-[var(--good)]">{checkoutMsg}</p>
      )}
    </div>
  );
}
