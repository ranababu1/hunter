"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import clsx from "clsx";
import type { CompanyFetch, FetchesSnapshot } from "@/lib/types";

function portalLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const truncated =
      path.length > 28 ? `${path.slice(0, 26)}…` : path;
    return `${u.host}${truncated}`;
  } catch {
    return url;
  }
}

function FetchTable({
  rows,
  showIssue,
}: {
  rows: CompanyFetch[];
  showIssue?: boolean;
}) {
  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-dim)]">
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Career portal</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Jobs fetched</th>
              <th className="px-4 py-3 font-semibold">Last fetched</th>
              {showIssue ? (
                <th className="px-4 py-3 font-semibold">Issue</th>
              ) : null}
              <th className="px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.company}
                className="border-b border-[var(--border)] last:border-b-0 transition hover:bg-[rgba(45,212,191,0.04)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--text)]">
                  {row.company}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={row.careerPortal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-[240px] items-center gap-1 text-[var(--accent)] hover:underline sm:max-w-[320px]"
                    title={row.careerPortal}
                  >
                    <span className="truncate">{portalLabel(row.careerPortal)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                  </a>
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                  {row.jobsFetched}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                  {row.lastFetched}
                </td>
                {showIssue ? (
                  <td className="max-w-md px-4 py-3 text-[var(--danger)]">
                    {row.issue ?? "—"}
                  </td>
                ) : null}
                <td className="max-w-xs px-4 py-3 text-[var(--text-muted)]">
                  {row.notes ? (
                    <span className="line-clamp-2">{row.notes}</span>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FetchesView({ snapshot }: { snapshot: FetchesSnapshot }) {
  const [issuesOpen, setIssuesOpen] = useState(false);

  const { okRows, issueRows, counts } = useMemo(() => {
    const companies = snapshot.companies;
    const okRows = companies
      .filter((c) => c.outcome === "ok" && c.jobsFetched > 0)
      .sort((a, b) => a.company.localeCompare(b.company));
    const issueRows = companies
      .filter((c) => c.outcome === "zero" || c.outcome === "error")
      .sort((a, b) => {
        if (a.outcome !== b.outcome) return a.outcome === "error" ? -1 : 1;
        return a.company.localeCompare(b.company);
      });
    const withHits = okRows.length;
    const zero = companies.filter((c) => c.outcome === "zero").length;
    const errors = companies.filter((c) => c.outcome === "error").length;
    return {
      okRows,
      issueRows,
      counts: {
        checked: companies.length,
        withHits,
        zero,
        errors,
      },
    };
  }, [snapshot]);

  const chips = [
    { label: "Companies checked", value: counts.checked },
    { label: "With hits", value: counts.withHits, tone: "strong" as const },
    { label: "Zero", value: counts.zero, tone: "muted" as const },
    { label: "Errors", value: counts.errors, tone: "danger" as const },
  ];

  return (
    <div className="space-y-8 fade-up">
      <div>
        <div className="eyebrow mb-2">Coverage</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Fetch details</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Company-level fetch metadata for the{" "}
          <span className="tabular-nums text-[var(--text)]">{snapshot.runDate}</span>{" "}
          Bengaluru AI search run — successful pulls above, blockers and empty
          boards below.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm"
          >
            <span className="text-[var(--text-dim)]">{chip.label}</span>
            <span
              className={clsx(
                "tabular-nums font-semibold",
                chip.tone === "strong" && "text-[var(--strong)]",
                chip.tone === "danger" && "text-[var(--danger)]",
                chip.tone === "muted" && "text-[var(--text-muted)]",
                !chip.tone && "text-[var(--accent)]",
              )}
            >
              {chip.value}
            </span>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          Successful fetches
          <span className="ml-2 font-normal tabular-nums text-[var(--text-dim)]">
            ({okRows.length})
          </span>
        </h2>
        {okRows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No successful fetches.</p>
        ) : (
          <FetchTable rows={okRows} />
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setIssuesOpen((o) => !o)}
          className="glass flex w-full items-center justify-between gap-3 rounded-[var(--radius)] px-4 py-3 text-left transition hover:border-[var(--border-strong)]"
          aria-expanded={issuesOpen}
        >
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">
              Issues &amp; zero fetches
              <span className="ml-2 font-normal tabular-nums text-[var(--text-dim)]">
                ({issueRows.length})
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Empty boards, closed postings, and fetch blockers from this run
            </p>
          </div>
          <ChevronDown
            className={clsx(
              "h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform",
              issuesOpen && "rotate-180",
            )}
          />
        </button>
        {issuesOpen ? (
          <div className="mt-3">
            <FetchTable rows={issueRows} showIssue />
          </div>
        ) : null}
      </section>
    </div>
  );
}
