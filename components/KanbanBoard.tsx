"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import type { AppState, Job, KanbanStatus } from "@/lib/types";
import { KANBAN_COLUMNS } from "@/lib/types";
import { JobCard } from "./JobCard";
import { JobDrawer } from "./JobDrawer";

function SortableCard({
  job,
  visited,
  status,
  onOpen,
}: {
  job: Job;
  visited: boolean;
  status?: KanbanStatus;
  onOpen: (job: Job) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id, data: { status } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <JobCard
        job={job}
        visited={visited}
        status={status}
        onOpen={onOpen}
        compact
      />
    </div>
  );
}

function Column({
  id,
  label,
  jobs,
  visitedSet,
  statusMap,
  onOpen,
}: {
  id: KanbanStatus;
  label: string;
  jobs: Job[];
  visitedSet: Set<string>;
  statusMap: Record<string, KanbanStatus>;
  onOpen: (job: Job) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", status: id },
  });

  return (
    <div
      className={clsx(
        "flex w-72 shrink-0 flex-col rounded-2xl border",
        isOver
          ? "border-[rgba(201,162,39,0.45)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[rgba(255,255,255,0.02)]",
      )}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold tracking-wide text-[var(--text)]">
          {label}
        </span>
        <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--text-dim)]">
          {jobs.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex min-h-[280px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3"
      >
        <SortableContext
          items={jobs.map((j) => j.id)}
          strategy={verticalListSortingStrategy}
        >
          {jobs.map((job) => (
            <SortableCard
              key={job.id}
              job={job}
              visited={visitedSet.has(job.id)}
              status={statusMap[job.id]}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
        {jobs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-3 py-8 text-center text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
            Drop here
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function KanbanBoard({
  jobs,
  initialState,
}: {
  jobs: Job[];
  initialState: AppState;
}) {
  const [state, setState] = useState<AppState>(initialState);
  const [selected, setSelected] = useState<Job | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const visitedSet = useMemo(
    () => new Set(state.visited),
    [state.visited],
  );

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>();
    jobs.forEach((j) => m.set(j.id, j));
    return m;
  }, [jobs]);

  const columns = useMemo(() => {
    const buckets: Record<KanbanStatus, Job[]> = {
      read_jd: [],
      not_applied: [],
      applied: [],
      response: [],
      interviewing: [],
      offer: [],
      rejected: [],
      ignored: [],
    };
    for (const job of jobs) {
      const s = state.status[job.id] ?? "not_applied";
      buckets[s].push(job);
    }
    return buckets;
  }, [jobs, state.status]);

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
      try {
        const res = await fetch("/api/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, ...body }),
        });
        if (res.ok) setState((await res.json()) as AppState);
      } catch {
        /* keep optimistic */
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const columnIds = useMemo(
    () => KANBAN_COLUMNS.map((c) => c.id) as KanbanStatus[],
    [],
  );

  /** Prefer column hit-targets (incl. empty) over tall card stacks. */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args);
    const columnHit = pointerHits.find((c) =>
      columnIds.includes(c.id as KanbanStatus),
    );
    if (columnHit) return [columnHit];
    if (pointerHits.length > 0) return pointerHits;
    const intersections = rectIntersection(args);
    const columnIntersect = intersections.find((c) =>
      columnIds.includes(c.id as KanbanStatus),
    );
    if (columnIntersect) return [columnIntersect];
    return closestCorners(args);
  }, [columnIds]);

  function findContainer(id: string): KanbanStatus | undefined {
    if (columnIds.includes(id as KanbanStatus)) {
      return id as KanbanStatus;
    }
    return state.status[id] ?? "not_applied";
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const jobId = String(active.id);
    const overId = String(over.id);
    const dest = columnIds.includes(overId as KanbanStatus)
      ? (overId as KanbanStatus)
      : findContainer(overId);
    if (!dest) return;
    const current = state.status[jobId] ?? "not_applied";
    if (current === dest) return;
    void patch(jobId, { status: dest, visited: true });
  }

  const activeJob = activeId ? jobMap.get(activeId) : null;

  return (
    <div className="space-y-6 fade-up">
      <div>
        <div className="eyebrow mb-2">Pipeline</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Kanban</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Drag roles across stages. Status persists in Upstash Redis when
          configured.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              jobs={columns[col.id]}
              visitedSet={visitedSet}
              statusMap={state.status}
              onOpen={setSelected}
            />
          ))}
        </div>
        <DragOverlay>
          {activeJob ? (
            <div className="w-72 opacity-95 shadow-2xl">
              <JobCard
                job={activeJob}
                visited={visitedSet.has(activeJob.id)}
                status={state.status[activeJob.id]}
                compact
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
