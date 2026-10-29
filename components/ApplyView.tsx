"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Lock, Send } from "lucide-react";
import clsx from "clsx";
import type { ApplyDecision, ApplyItem, ApplyStatus } from "@/lib/types";
import { APPLY_STATUSES } from "@/lib/types";
import { MatchBadge } from "@/components/MatchBadge";

const STATUS_STYLE: Record<ApplyStatus, string> = {
  pending: "border-[var(--border)] text-[var(--text-muted)]",
  approved: "border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]",
  applying: "border-[rgba(96,165,250,0.45)] bg-[rgba(96,165,250,0.12)] text-[#93c5fd]",
  applied: "border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.12)] text-[#86efac]",
  skipped: "border-[var(--border)] text-[var(--text-dim)]",
  already_in_touch: "border-[rgba(192,132,252,0.45)] bg-[rgba(192,132,252,0.12)] text-[#d8b4fe]",
  needs_you: "border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.12)] text-[#fcd34d]",
};

function statusLabel(s: ApplyStatus) {
  return APPLY_STATUSES.find((x) => x.id === s)?.label ?? s;
}

function UpgradePrompt() {
  return (
    <div className="glass mx-auto max-w-xl p-8 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "var(--accent-soft)", border: "1px solid rgba(45,212,191,0.35)" }}
      >
        <Lock className="h-5 w-5" style={{ color: "var(--accent)" }} />
      </div>
      <h2 className="prose-title mt-4 text-2xl">Apply add-on</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Get a shortlist of roles worth applying to, with why each fits, the
        gaps to address and resume tailoring notes. Approve with one click and
        your assistant applies for you — skipping anything where you&apos;re
        already in touch with a human.
      </p>
      <div className="mt-5 text-3xl font-semibold text-[var(--text)]">
        $50<span className="text-base font-normal text-[var(--text-dim)]">/month</span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-dim)]">
        Separate from your plan. Online checkout is coming soon.
      </p>
      <Link
        href="/contact"
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
      >
        <Send className="h-3.5 w-3.5" /> Request access
      </Link>
    </div>
  );
}

function ItemCard({
  item,
  onDecide,
  busy,
}: {
  item: ApplyItem;
  onDecide: (id: string, d: ApplyDecision) => void;
  busy: boolean;
}) {
  const value = item.decision ?? "";
  return (
    <div className="glass flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-dim)]">
            {item.company}
            {item.location ? ` · ${item.location}` : ""}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-[var(--text)] hover:text-[var(--accent)]"
          >
            {item.role}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <MatchBadge match={item.match} />
          <span
            className={clsx(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              STATUS_STYLE[item.status],
            )}
          >
            {statusLabel(item.status)}
          </span>
        </div>
      </div>

      {item.whyRecommended ? (
        <div>
          <div className="eyebrow mb-1">Why apply</div>
          <p className="text-sm text-[var(--text-muted)]">{item.whyRecommended}</p>
        </div>
      ) : null}

      {item.gaps.length ? (
        <div>
          <div className="eyebrow mb-1">Gaps</div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--text-muted)]">
            {item.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.resumeId ? (
        <Link
          href={`/resumes?id=${encodeURIComponent(item.resumeId)}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:brightness-110"
        >
          Review tailored resume →
        </Link>
      ) : null}

      {item.resume || item.tailoringNotes ? (
        <div>
          <div className="eyebrow mb-1">Resume</div>
          {item.resume ? (
            <div className="text-sm font-medium text-[var(--text)]">{item.resume}</div>
          ) : null}
          {item.tailoringNotes ? (
            <p className="mt-0.5 whitespace-pre-line text-sm text-[var(--text-muted)]">
              {item.tailoringNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      {item.assistantNotes ? (
        <div
          className={clsx(
            "rounded-lg border px-3 py-2 text-sm",
            item.status === "needs_you"
              ? "border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.08)] text-[#fde68a]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]",
          )}
        >
          {item.assistantNotes}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          Apply?
          <select
            value={value}
            disabled={busy}
            onChange={(e) =>
              onDecide(
                item.id,
                e.target.value === "" ? null : (e.target.value as ApplyDecision),
              )
            }
            className="rounded-lg border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
          >
            <option value="">— Decide —</option>
            <option value="yes">Yes, apply</option>
            <option value="no">No, skip</option>
          </select>
        </label>
        <span className="text-[11px] text-[var(--text-dim)]">
          {item.appliedAt
            ? `Applied ${new Date(item.appliedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Calcutta", dateStyle: "medium" })}`
            : `Updated ${new Date(item.updatedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Calcutta", dateStyle: "medium" })}`}
        </span>
      </div>
    </div>
  );
}

export function ApplyView({
  enabled,
  initialItems,
}: {
  enabled: boolean;
  initialItems: ApplyItem[];
}) {
  const [items, setItems] = useState<ApplyItem[]>(initialItems);
  const [filter, setFilter] = useState<"all" | ApplyStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);

  async function decide(id: string, decision: ApplyDecision) {
    setBusyId(id);
    setError(null);
    const prev = items;
    setItems((list) =>
      list.map((i) =>
        i.id === id
          ? {
              ...i,
              decision,
              status: ["applying", "applied", "already_in_touch"].includes(i.status)
                ? i.status
                : decision === "yes"
                  ? "approved"
                  : decision === "no"
                    ? "skipped"
                    : "pending",
            }
          : i,
      ),
    );
    try {
      const res = await fetch("/api/apply", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = (await res.json()) as { item?: ApplyItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? "Save failed");
      setItems((list) => list.map((i) => (i.id === id ? data.item! : i)));
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <div>
        <div className="eyebrow mb-2">Add-on</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Apply</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Roles your assistant recommends prioritising. Pick Yes and it applies
          for you with a tailored resume; pick No to skip. It checks your inbox
          first and won&apos;t re-apply where a human has already replied.
        </p>
      </div>

      {!enabled ? (
        <UpgradePrompt />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "all" as const, label: "All" }, ...APPLY_STATUSES].map((s) => {
              const n = s.id === "all" ? items.length : (counts[s.id] ?? 0);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilter(s.id)}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    filter === s.id
                      ? "border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
                  )}
                >
                  {s.label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="rounded-lg border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.08)] px-3 py-2 text-sm text-[#fca5a5]">
              {error}
            </div>
          ) : null}

          {shown.length === 0 ? (
            <div className="glass px-6 py-12 text-center text-sm text-[var(--text-dim)]">
              {items.length === 0
                ? "No recommendations yet. Your assistant will post a shortlist here."
                : "Nothing in this status."}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDecide={decide}
                  busy={busyId === item.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
