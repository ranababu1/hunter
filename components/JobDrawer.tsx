"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X, Eye } from "lucide-react";
import type { Job, KanbanStatus } from "@/lib/types";
import { ALL_STATUSES, normalizeStatus } from "@/lib/types";
import { MatchBadge } from "./MatchBadge";

export function JobDrawer({
  job,
  open,
  visited,
  status,
  onClose,
  onMarkVisited,
  onStatusChange,
}: {
  job: Job | null;
  open: boolean;
  visited: boolean;
  status?: KanbanStatus;
  onClose: () => void;
  onMarkVisited: (jobId: string) => void;
  onStatusChange: (jobId: string, status: KanbanStatus) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const current = status ? normalizeStatus(status) : "";

  return (
    <AnimatePresence>
      {open && job && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-5">
              <div>
                <div className="eyebrow mb-2">{job.company}</div>
                <h2 className="prose-title text-2xl leading-tight">{job.role}</h2>
                <div className="mt-3">
                  <MatchBadge match={job.match} />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <section>
                <div className="eyebrow mb-2">AI focus</div>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  {job.aiFocus}
                </p>
              </section>
              <section>
                <div className="eyebrow mb-2">Why it matches</div>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  {job.whyMatch}
                </p>
              </section>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="eyebrow mb-1">Level</dt>
                  <dd>{job.level}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Location</dt>
                  <dd>{job.location}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Posted / updated</dt>
                  <dd>{job.postedOrUpdated}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Date seen</dt>
                  <dd>{job.dateSeen}</dd>
                </div>
              </dl>

              <section className="space-y-3">
                <div className="eyebrow">Pipeline status</div>
                <select
                  value={current}
                  onChange={(e) =>
                    onStatusChange(job.id, e.target.value as KanbanStatus)
                  }
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="" disabled>
                    Set status…
                  </option>
                  {ALL_STATUSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </section>
            </div>

            <div className="flex gap-2 border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => onMarkVisited(job.id)}
                disabled={visited}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-3 py-2.5 text-sm transition hover:border-[var(--visited-border)] disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                {visited ? "Visited" : "Mark visited"}
              </button>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onMarkVisited(job.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#0d1117]"
                style={{ background: "var(--accent)" }}
              >
                Open posting <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
