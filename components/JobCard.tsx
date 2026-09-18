"use client";

import { motion } from "framer-motion";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { Job, KanbanStatus } from "@/lib/types";
import { MatchBadge } from "./MatchBadge";

export function JobCard({
  job,
  visited,
  status,
  onOpen,
  compact,
}: {
  job: Job;
  visited?: boolean;
  status?: KanbanStatus;
  onOpen?: (job: Job) => void;
  compact?: boolean;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.28 }}
      onClick={() => onOpen?.(job)}
      className={clsx(
        "group cursor-pointer border p-4 transition",
        compact ? "rounded-xl" : "glass",
        visited
          ? "border-[var(--visited-border)] bg-[var(--visited)]"
          : "border-[var(--border)] hover:border-[rgba(201,162,39,0.35)]",
      )}
      style={
        compact
          ? {
              background: visited
                ? "var(--visited)"
                : "rgba(255,255,255,0.03)",
            }
          : undefined
      }
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--accent)]">
              {job.company}
            </span>
            {job.isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--violet-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--violet)]">
                <Sparkles className="h-3 w-3" />
                NEW
              </span>
            )}
          </div>
          <h3
            className={clsx(
              "mt-1 leading-snug text-[var(--text)]",
              compact ? "text-sm font-medium" : "prose-title text-lg",
            )}
          >
            {job.role}
          </h3>
        </div>
        <MatchBadge match={job.match} />
      </div>

      {!compact && (
        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">
          {job.aiFocus}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-dim)]">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {job.location}
        </span>
        <span>{job.level}</span>
        {status && (
          <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {status.replace(/_/g, " ")}
          </span>
        )}
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto inline-flex items-center gap-1 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--accent)]"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </motion.article>
  );
}
