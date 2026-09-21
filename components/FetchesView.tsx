"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ExternalLink, Play, RefreshCw, Zap } from "lucide-react";
import clsx from "clsx";
import type { CompanyFetch, FetchRun } from "@/lib/types";
import { useMe } from "@/components/MeProvider";
import { Toast } from "@/components/Toast";

function portalLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const truncated = path.length > 28 ? `${path.slice(0, 26)}…` : path;
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
              <th className="px-4 py-3 font-semibold tabular-nums">
                Jobs fetched
              </th>
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
                  {row.careerPortal && row.careerPortal !== "#" ? (
                    <a
                      href={row.careerPortal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[240px] items-center gap-1 text-[var(--accent)] hover:underline sm:max-w-[320px]"
                      title={row.careerPortal}
                    >
                      <span className="truncate">
                        {portalLabel(row.careerPortal)}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                    </a>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
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

type ManualFetchInfo = {
  count: number;
  limit: number;
  remaining: number;
  boosted?: boolean;
  canRun?: boolean;
  resetsAt?: string;
} | null;

type FetchesApi = {
  runs: FetchRun[];
  latest: FetchRun | null;
  fromSeed: boolean;
  lastFetchDate: string | null;
  nextEligibleDate: string;
  canRun: boolean;
  cadence: "daily" | "alternate";
  usesCadenceGate: boolean;
  manualFetch: ManualFetchInfo;
  maxFetchHistory: number;
  entitlements: {
    fetchCadence: string;
    maxFetchHistory: number;
    fetchEnabled: boolean;
    isAdmin: boolean;
  };
};

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_TICKS = 20; // ~80s ceiling on the pendingRetry poll

export function FetchesView() {
  const { refreshMe } = useMe();
  const searchParams = useSearchParams();
  const boosted = searchParams.get("fetch") === "more";

  const [data, setData] = useState<FetchesApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pollTicks = useRef(0);
  const announcedRunId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fetches");
      if (!res.ok) {
        setError("Failed to load fetches");
        return;
      }
      const json = (await res.json()) as FetchesApi;
      setData(json);
      setSelectedId((prev) => prev ?? json.latest?.id ?? null);
      return json;
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While the latest run still has companies retrying in the background,
  // poll for the final result and fire a toast once every company that was
  // checked came back with at least one hit (or the poll window lapses).
  useEffect(() => {
    if (!data?.latest?.pendingRetry) return;
    if (announcedRunId.current === data.latest.id) return;

    pollTicks.current = 0;
    const interval = setInterval(async () => {
      pollTicks.current += 1;
      const json = await refresh();
      const stillPending = json?.latest?.pendingRetry;
      if (!stillPending || pollTicks.current >= POLL_MAX_TICKS) {
        clearInterval(interval);
        if (json?.latest && announcedRunId.current !== json.latest.id) {
          announcedRunId.current = json.latest.id;
          const results = json.latest.companyResults;
          const allOk = results.length > 0 && results.every((r) => r.jobsFetched > 0);
          if (allOk) {
            setToast(
              `All ${results.length} compan${results.length === 1 ? "y" : "ies"} fetched successfully.`,
            );
          } else if (results.some((r) => r.jobsFetched > 0)) {
            setToast(
              `Fetch finished — ${results.filter((r) => r.jobsFetched > 0).length} of ${results.length} companies returned postings.`,
            );
          }
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.latest?.id, data?.latest?.pendingRetry]);

  async function runFetch() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/fetches/run${boosted ? "?fetch=more" : ""}`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        error?: string;
        nextEligibleDate?: string;
        run?: FetchRun;
        manualFetch?: ManualFetchInfo;
      };
      if (!res.ok) {
        if (json.error === "FETCH_CADENCE") {
          setError(
            `Next eligible fetch: ${json.nextEligibleDate ?? "later"} (cadence limit)`,
          );
        } else if (json.error === "MANUAL_FETCH_LIMIT") {
          setError(
            boosted
              ? `Daily fetch limit reached (${json.manualFetch?.limit ?? 10}/day, even boosted). Resets at midnight IST.`
              : `You've used today's ${json.manualFetch?.limit ?? 2} free manual fetches. Add ?fetch=more to the URL for up to 10/day, or wait for the reset at midnight IST.`,
          );
        } else {
          setError(json.error ?? "Fetch failed");
        }
        await refresh();
        return;
      }
      if (json.run) {
        setSelectedId(json.run.id);
        if (!json.run.pendingRetry) announcedRunId.current = json.run.id;
      }
      await refresh();
      await refreshMe();
    } catch {
      setError("Network error");
    } finally {
      setRunning(false);
    }
  }

  const snapshot: FetchRun | null = useMemo(() => {
    if (!data) return null;
    if (selectedId) {
      const fromHistory = data.runs.find((r) => r.id === selectedId);
      if (fromHistory) return fromHistory;
      if (data.latest?.id === selectedId) return data.latest;
    }
    return data.latest;
  }, [data, selectedId]);

  const { okRows, issueRows, counts } = useMemo(() => {
    const companies = snapshot?.companyResults ?? [];
    const okRows = companies
      .filter((c) => c.outcome === "ok" && c.jobsFetched > 0)
      .sort((a, b) => a.company.localeCompare(b.company));
    const issueRows = companies
      .filter((c) => c.outcome === "zero" || c.outcome === "error")
      .sort((a, b) => {
        if (a.outcome !== b.outcome) return a.outcome === "error" ? -1 : 1;
        return a.company.localeCompare(b.company);
      });
    return {
      okRows,
      issueRows,
      counts: {
        checked: companies.length,
        withHits: okRows.length,
        zero: companies.filter((c) => c.outcome === "zero").length,
        errors: companies.filter((c) => c.outcome === "error").length,
      },
    };
  }, [snapshot]);

  if (loading && !data) {
    return (
      <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Loading fetches…
      </div>
    );
  }

  const cadence = data?.cadence ?? "alternate";
  const maxHist = data?.maxFetchHistory ?? 30;
  const historyNote =
    maxHist < 0
      ? "Unlimited fetch history"
      : `History retains last ${maxHist} runs (free plan)`;
  const manual = data?.manualFetch ?? null;

  const chips = [
    { label: "Companies checked", value: counts.checked },
    { label: "With hits", value: counts.withHits, tone: "strong" as const },
    { label: "Zero", value: counts.zero, tone: "muted" as const },
    { label: "Errors", value: counts.errors, tone: "danger" as const },
  ];

  return (
    <div className="space-y-8 fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Coverage</div>
          <h1 className="prose-title text-3xl sm:text-4xl">Fetch details</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Hunter visits each active company&apos;s real careers portal —
            known ATS platforms via their own public job-board data, others
            via structured job listings on the page — and merges what it
            finds into your feed. Portals that block automated requests are
            reported honestly, not faked.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.usesCadenceGate ? (
            <span
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide",
                cadence === "daily"
                  ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
            >
              Cadence · {cadence}
            </span>
          ) : manual ? (
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                manual.remaining > 0
                  ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
              title={
                manual.boosted
                  ? "Boosted"
                  : "Add ?fetch=more to the URL for up to 10/day"
              }
            >
              {manual.boosted && <Zap className="h-3 w-3" />}
              {manual.count} / {manual.limit} manual fetches today
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            disabled={running || (data != null && !data.canRun)}
            onClick={() => void runFetch()}
            title={
              data && !data.canRun
                ? data.usesCadenceGate
                  ? `Next eligible: ${data.nextEligibleDate}`
                  : "Today's manual fetches are used up"
                : "Run fetch now"
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-1.5 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? "Fetching…" : "Run fetch"}
          </button>
        </div>
      </div>

      {data && (
        <p className="text-xs text-[var(--text-dim)]">
          {historyNote}
          {data.lastFetchDate
            ? ` · Last run ${data.lastFetchDate}`
            : " · No personal runs yet"}
          {data.usesCadenceGate
            ? data.canRun
              ? " · Eligible today"
              : ` · Next eligible ${data.nextEligibleDate}`
            : manual
              ? manual.remaining > 0
                ? ` · ${manual.remaining} manual fetch${manual.remaining === 1 ? "" : "es"} left today`
                : " · Add ?fetch=more to the page URL for up to 10/day"
              : ""}
        </p>
      )}

      {snapshot?.pendingRetry && (
        <p className="flex items-center gap-2 text-xs text-[var(--accent)]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Some companies hit a temporary error and are being retried in the
          background — this list will update automatically.
        </p>
      )}

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {data && data.runs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            History
            <span className="ml-2 font-normal tabular-nums text-[var(--text-dim)]">
              ({data.runs.length}
              {maxHist > 0 ? ` / ${maxHist}` : ""})
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs tabular-nums transition",
                  selectedId === r.id
                    ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {r.runDate} · {r.status} · {r.jobsFound} jobs
              </button>
            ))}
          </div>
        </section>
      )}

      {!snapshot ? (
        <p className="text-sm text-[var(--text-muted)]">
          No fetch data yet. Add active companies and click{" "}
          <strong>Run fetch</strong> to check their real careers portals.
        </p>
      ) : (
        <>
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
            <div className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm">
              <span className="text-[var(--text-dim)]">Run date</span>
              <span className="tabular-nums font-semibold text-[var(--text)]">
                {snapshot.runDate}
              </span>
            </div>
          </div>

          {snapshot.notes && (
            <p className="text-xs text-[var(--text-muted)]">{snapshot.notes}</p>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Successful fetches
              <span className="ml-2 font-normal tabular-nums text-[var(--text-dim)]">
                ({okRows.length})
              </span>
            </h2>
            {okRows.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No successful fetches.
              </p>
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
                  Empty boards, closed postings, and portals that blocked or
                  errored on this run
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
        </>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
