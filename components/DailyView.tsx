"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, Job, KanbanStatus } from "@/lib/types";
import { JobCard } from "./JobCard";
import { JobDrawer } from "./JobDrawer";
import { StatStrip } from "./StatStrip";

export function DailyView({
  title,
  date,
  jobs,
  initialState,
}: {
  title: string;
  date: string;
  jobs: Job[];
  initialState: AppState;
}) {
  const [state, setState] = useState<AppState>(initialState);
  const [selected, setSelected] = useState<Job | null>(null);

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
        const next = (await res.json()) as AppState;
        setState(next);
      } else {
        // optimistic local fallback when redis missing
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

  const sorted = useMemo(() => {
    const rank = { "Strong Match": 0, "Good Match": 1, "Possible Match": 2 };
    return [...jobs].sort(
      (a, b) =>
        Number(b.isNew) - Number(a.isNew) ||
        rank[a.match] - rank[b.match],
    );
  }, [jobs]);

  return (
    <div className="space-y-8 fade-up">
      <div>
        <div className="eyebrow mb-2">Daily digest · {date}</div>
        <h1 className="prose-title text-3xl sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
          Morning briefing of Bengaluru AI / GenAI roles. Open a card for
          detail, mark visited, and move into your pipeline.
        </p>
      </div>

      <StatStrip jobs={jobs} visitedCount={state.visited.length} />

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            visited={visitedSet.has(job.id)}
            status={state.status[job.id]}
            onOpen={setSelected}
          />
        ))}
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
