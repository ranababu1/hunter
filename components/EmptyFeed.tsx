import Link from "next/link";
import { Building2, Radio, Sparkles, User } from "lucide-react";

/**
 * Shown when a tenant has no daily digests yet. Everything here is derived
 * from the tenant's own profile/companies — never from another account.
 */
export function EmptyFeed({
  roles,
  companiesCount,
  jobsCount,
}: {
  roles: string[];
  companiesCount: number;
  jobsCount: number;
}) {
  return (
    <div className="fade-up mx-auto max-w-2xl space-y-6">
      <div className="glass p-8 sm:p-10">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid rgba(45,212,191,0.35)",
            }}
          >
            <Sparkles className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="eyebrow">Your feed</div>
            <h1 className="prose-title text-2xl text-[var(--text)]">
              Nothing here yet, and that is expected
            </h1>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Hunter only shows jobs pulled for <strong>your</strong> account. Your
          first digest lands after the next morning fetch runs against the
          companies and roles you set up. Until then this page stays empty.
        </p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
              Target roles
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {roles.length}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
              Active companies
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {companiesCount}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
              Jobs in feed
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {jobsCount}
            </dd>
          </div>
        </dl>

        {roles.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)]"
          >
            <Building2 className="h-4 w-4" />
            Manage companies
          </Link>
          <Link
            href="/fetches"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Radio className="h-4 w-4" />
            Fetch status
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <User className="h-4 w-4" />
            Refine profile
          </Link>
        </div>
      </div>
    </div>
  );
}
