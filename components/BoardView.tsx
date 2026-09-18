"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import clsx from "clsx";
import type { AppState, Job, KanbanStatus, MatchLevel } from "@/lib/types";
import { JobCard } from "./JobCard";
import { JobDrawer } from "./JobDrawer";
import { StatStrip } from "./StatStrip";

const FILTERS: Array<"All" | MatchLevel> = [
  "All",
  "Strong Match",
  "Good Match",
  "Possible Match",
];

export function BoardView({
  jobs,
  initialState,
}: {
  jobs: Job[];
  initialState: AppState;
}) {
  const [state, setState] = useState<AppState>(initialState);
  const [selected, setSelected] = useState<Job | null>(null);
  const [q, setQ] = useState("");
  const [match, setMatch] = useState<"All" | MatchLevel>("All");

  const visitedSet = useMemo(
    () => new Set(state.visited),
    [state.visited],
  );

  const patch = useCallback(
    async (jobId: string, body: { visited?: boolean; status?: KanbanStatus }) => {
      const res = await fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...body }),
      });
      if (res.ok) {
        setState((await res.json()) as AppState);
      } else {
        setState((prev) => {
          const visited = body.visited
            ? Array.from(new Set([...prev.visited, jobId]))
            : prev.visited;
          const status = { ...prev.status };
          if (body.status) status[jobId] = body.status;
          return { visited, status };
        });
      }
    },
    [],
  );

  useEffect(() => {
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setState(data as AppState);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (match !== "All" && j.match !== match) return false;
      if (!query) return true;
      return (
        j.company.toLowerCase().includes(query) ||
        j.role.toLowerCase().includes(query) ||
        j.aiFocus.toLowerCase().includes(query) ||
        j.location.toLowerCase().includes(query)
      );
    });
  }, [jobs, q, match]);

  return (
    <div className="space-y-8 fade-up">
      <div>
        <div className="eyebrow mb-2">Consolidated</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Role board</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Search and filter the full pipeline. Visited roles pick up a cool
          blue tint.
        </p>
      </div>

      <StatStrip jobs={filtered} visitedCount={state.visited.length} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, role, focus…"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setMatch(f)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                match === f
                  ? "border-[rgba(201,162,39,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            visited={visitedSet.has(job.id)}
            status={state.status[job.id]}
            onOpen={setSelected}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-[var(--text-dim)]">
            No roles match that filter.
          </p>
        )}
      </div>

      <JobDrawer
        job={selected}
        open={Boolean(selected)}
        visited={selected ? visitedSet.has(selected.id) : false}
        status={selected ? state.status[selected.id] : undefined}
        onClose={() => setSelected(null)}
        onMarkVisited={(id) => patch(id, { visited: true })}
        onStatusChange={(id, status) => patch(id, { status, visited: true })}
      />
    </div>
  );
}
