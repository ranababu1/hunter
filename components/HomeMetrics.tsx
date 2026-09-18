"use client";

import { useMemo } from "react";
import clsx from "clsx";
import {
  Briefcase,
  Sparkles,
  Target,
  Send,
  MessagesSquare,
  Clock3,
  Building2,
  EyeOff,
  CalendarDays,
  CircleDot,
} from "lucide-react";
import type { ComponentType } from "react";
import type { AppState, Job, KanbanStatus } from "@/lib/types";
import { isEndStatus, normalizeStatus } from "@/lib/types";

function parseDay(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

type Metric = {
  key: string;
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "accent" | "strong" | "warn" | "muted" | "default";
};

function toneClass(tone: Metric["tone"]) {
  switch (tone) {
    case "accent":
      return "text-[var(--accent)]";
    case "strong":
      return "text-[var(--strong)]";
    case "warn":
      return "text-[var(--good)]";
    case "muted":
      return "text-[var(--text-muted)]";
    default:
      return "text-[var(--text)]";
  }
}

function MetricCard({ item, large }: { item: Metric; large?: boolean }) {
  const Icon = item.icon;
  return (
    <div
      className={clsx(
        "glass group relative overflow-hidden transition",
        large ? "px-5 py-4 sm:px-6 sm:py-5" : "px-4 py-3.5",
      )}
      style={{ borderRadius: 14 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">{item.label}</div>
          <div
            className={clsx(
              "font-semibold tracking-tight tabular-nums",
              large ? "text-3xl sm:text-4xl" : "text-2xl",
              toneClass(item.tone),
            )}
          >
            {item.value}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-dim)]">
            {item.hint}
          </p>
        </div>
        <div
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.03)]",
            toneClass(item.tone),
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function HomeMetrics({
  allJobs,
  digestJobs,
  digestDate,
  latestDate,
  state,
}: {
  allJobs: Job[];
  digestJobs: Job[];
  digestDate: string;
  latestDate: string;
  state: AppState;
}) {
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const statusOf = (id: string): KanbanStatus =>
      normalizeStatus(state.status[id]);

    const visited = new Set(state.visited);
    const strong = allJobs.filter((j) => j.match === "Strong Match").length;
    const neu = allJobs.filter((j) => j.isNew).length;
    const companies = new Set(allJobs.map((j) => j.company)).size;

    const applied = allJobs.filter((j) => {
      const s = statusOf(j.id);
      return (
        s === "applied" ||
        s === "responded" ||
        s === "interviewing" ||
        isEndStatus(s)
      );
    }).length;

    const interviewing = allJobs.filter(
      (j) => statusOf(j.id) === "interviewing",
    ).length;

    const inPlay = allJobs.filter((j) => {
      const s = statusOf(j.id);
      return s === "responded" || s === "interviewing";
    }).length;

    const needsReview = allJobs.filter((j) => {
      const s = statusOf(j.id);
      return !visited.has(j.id) && s === "identified";
    }).length;

    const aging = allJobs.filter((j) => {
      const s = statusOf(j.id);
      if (isEndStatus(s)) return false;
      const posted = parseDay(j.postedOrUpdated);
      if (!posted) return false;
      return daysBetween(today, posted) >= 21;
    }).length;

    const digestStrong = digestJobs.filter(
      (j) => j.match === "Strong Match",
    ).length;
    const digestNew = digestJobs.filter((j) => j.isNew).length;
    const digestVisited = digestJobs.filter((j) => visited.has(j.id)).length;

    const primary: Metric[] = [
      {
        key: "tracked",
        label: "Tracked roles",
        value: allJobs.length,
        hint: "All roles in your Hunter board",
        icon: Briefcase,
        tone: "default",
      },
      {
        key: "today",
        label: digestDate === latestDate ? "Pulled today" : "This digest",
        value: digestJobs.length,
        hint: `Digest · ${digestDate}`,
        icon: CalendarDays,
        tone: "accent",
      },
      {
        key: "new",
        label: "New flags",
        value: neu,
        hint: "Marked new across the board",
        icon: Sparkles,
        tone: "accent",
      },
      {
        key: "strong",
        label: "Strong match",
        value: strong,
        hint: "Highest fit for your profile",
        icon: Target,
        tone: "strong",
      },
    ];

    const pipeline: Metric[] = [
      {
        key: "applied",
        label: "Applied",
        value: applied,
        hint: "Applied or further in pipeline",
        icon: Send,
      },
      {
        key: "inplay",
        label: "In play",
        value: inPlay,
        hint: "Responded or interviewing",
        icon: MessagesSquare,
        tone: "accent",
      },
      {
        key: "interviewing",
        label: "Interviewing",
        value: interviewing,
        hint: "Active interview loops",
        icon: CircleDot,
        tone: "strong",
      },
      {
        key: "aging",
        label: "Aging 21d+",
        value: aging,
        hint: "Open roles posted 21+ days ago",
        icon: Clock3,
        tone: aging > 0 ? "warn" : "muted",
      },
      {
        key: "review",
        label: "Needs review",
        value: needsReview,
        hint: "Identified and not visited yet",
        icon: EyeOff,
        tone: needsReview > 0 ? "warn" : "muted",
      },
      {
        key: "companies",
        label: "Companies",
        value: companies,
        hint: "Unique employers tracked",
        icon: Building2,
      },
    ];

    const digestExtras: Metric[] = [
      {
        key: "d-strong",
        label: "Strong today",
        value: digestStrong,
        hint: "Strong matches in this digest",
        icon: Target,
        tone: "strong",
      },
      {
        key: "d-new",
        label: "New today",
        value: digestNew,
        hint: "New flags in this digest",
        icon: Sparkles,
        tone: "accent",
      },
      {
        key: "d-visited",
        label: "Visited today",
        value: digestVisited,
        hint: "Opened from this digest",
        icon: Briefcase,
      },
    ];

    return { primary, pipeline, digestExtras };
  }, [allJobs, digestJobs, digestDate, latestDate, state]);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Snapshot</div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Pipeline metrics
          </h2>
        </div>
        <p className="hidden text-right text-[11px] text-[var(--text-dim)] sm:block">
          Live from digests + kanban · aging uses post date
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {metrics.primary.map((item) => (
          <MetricCard key={item.key} item={item} large />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {metrics.pipeline.map((item) => (
          <MetricCard key={item.key} item={item} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {metrics.digestExtras.map((item) => (
          <MetricCard key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}
