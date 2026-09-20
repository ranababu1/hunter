"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, DailyDigest, Job, KanbanStatus } from "@/lib/types";
import { normalizeStatus } from "@/lib/types";
import { JobCard } from "./JobCard";
import { JobDrawer } from "./JobDrawer";
import { HomeMetrics } from "./HomeMetrics";

export function DailyView({
  dates,
  digests,
  initialDate,
  initialState,
  allJobs,
}: {
  dates: string[];
  digests: DailyDigest[];
  initialDate: string;
  initialState: AppState;
  allJobs: Job[];
}) {
  const [state, setState] = useState<AppState>(() => ({
    visited: initialState.visited,
    status: Object.fromEntries(
      Object.entries(initialState.status).map(([k, v]) => [
        k,
        normalizeStatus(v),
      ]),
    ) as Record<string, KanbanStatus>,
  }));
  const [selected, setSelected] = useState<Job | null>(null);
  const [date, setDate] = useState(initialDate);

  const digestMap = useMemo(() => {
    const m = new Map<string, DailyDigest>();
    digests.forEach((d) => m.set(d.date, d));
    return m;
  }, [digests]);

  const current = digestMap.get(date) ?? digests[0];
  const jobs = current?.jobs ?? [];
  const title = current?.title ?? "Daily digest";

  const visitedSet = useMemo(
    () => new Set(state.visited),
    [state.visited],
  );

  const patch = useCallback(
    async (jobId: string, body: { visited?: boolean; status?: KanbanStatus }) => {
      setState((prev) => {
        const visited = body.visited
          ? Array.from(new Set([...prev.visited, jobId]))
          : prev.visited;
        const status = { ...prev.status };
        if (body.status) status[jobId] = body.status;
        return { visited, status };
      });
      const res = await fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...body }),
      });
      if (res.ok) {
        const next = (await res.json()) as AppState;
        setState({
          visited: next.visited,
          status: Object.fromEntries(
            Object.entries(next.status).map(([k, v]) => [
              k,
              normalizeStatus(v),
            ]),
          ) as Record<string, KanbanStatus>,
        });
      }
    },
    [],
  );

  useEffect(() => {
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const next = data as AppState;
          setState({
            visited: next.visited,
            status: Object.fromEntries(
              Object.entries(next.status).map(([k, v]) => [
                k,
                normalizeStatus(v),
              ]),
            ) as Record<string, KanbanStatus>,
          });
        }
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow mb-2">Daily digest · {date}</div>
          <h1 className="prose-title text-3xl sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            Morning briefing of new roles from the companies you watch. Open a card for
            detail, mark visited, and move into your pipeline.
          </p>
        </div>
        {dates.length > 0 && (
          <label className="flex shrink-0 flex-col gap-1 sm:items-end">
            <span className="eyebrow">Date</span>
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <HomeMetrics
        allJobs={allJobs}
        digestJobs={jobs}
        digestDate={date}
        latestDate={dates[0] ?? date}
        state={state}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            visited={visitedSet.has(job.id)}
            status={
              state.status[job.id]
                ? normalizeStatus(state.status[job.id])
                : undefined
            }
            onOpen={setSelected}
          />
        ))}
        {sorted.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-[var(--text-dim)]">
            No roles for this date.
          </p>
        )}
      </div>

      <JobDrawer
        job={selected}
        open={Boolean(selected)}
        visited={selected ? visitedSet.has(selected.id) : false}
        status={
          selected && state.status[selected.id]
            ? normalizeStatus(state.status[selected.id])
            : undefined
        }
        onClose={() => setSelected(null)}
        onMarkVisited={(id) => patch(id, { visited: true })}
        onStatusChange={(id, status) => patch(id, { status, visited: true })}
      />
    </div>
  );
}
