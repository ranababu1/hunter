"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  END_OUTCOMES,
  KANBAN_BOARD_COLUMNS,
  isEndStatus,
  normalizeStatus,
} from "@/lib/types";
import { JobCard } from "./JobCard";
import { JobDrawer } from "./JobDrawer";

type BoardColumnId = (typeof KANBAN_BOARD_COLUMNS)[number]["id"];

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
        showEndBadge={status ? isEndStatus(status) : false}
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
  id: BoardColumnId;
  label: string;
  jobs: Job[];
  visitedSet: Set<string>;
  statusMap: Record<string, KanbanStatus>;
  onOpen: (job: Job) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", columnId: id },
  });

  return (
    <div
      className={clsx(
        "flex w-72 shrink-0 flex-col rounded-xl border md:w-auto md:min-w-0 md:flex-1 md:shrink",
        isOver
          ? "border-[rgba(45,212,191,0.5)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--bg-elevated)]",
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
              status={normalizeStatus(statusMap[job.id])}
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

function EndOutcomeModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (status: KanbanStatus) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-outcome-title"
        className="glass w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="end-outcome-title" className="prose-title text-lg">
          End outcome
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          How did this role end?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {END_OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onConfirm(o.id)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left text-sm transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Cancel
        </button>
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingEnd, setPendingEnd] = useState<{
    jobId: string;
    previous: KanbanStatus;
  } | null>(null);

  const visitedSet = useMemo(
    () => new Set(state.visited),
    [state.visited],
  );

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>();
    jobs.forEach((j) => m.set(j.id, j));
    return m;
  }, [jobs]);

  const getStatus = useCallback(
    (jobId: string): KanbanStatus =>
      normalizeStatus(state.status[jobId]),
    [state.status],
  );

  const columns = useMemo(() => {
    const buckets: Record<string, Job[]> = {
      identified: [],
      applied: [],
      responded: [],
      interviewing: [],
      end: [],
    };
    for (const job of jobs) {
      const s = getStatus(job.id);
      if (isEndStatus(s)) {
        buckets.end.push(job);
      } else {
        buckets[s].push(job);
      }
    }
    return buckets;
  }, [jobs, getStatus]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const droppableIds = useMemo(
    () => KANBAN_BOARD_COLUMNS.map((c) => c.id) as BoardColumnId[],
    [],
  );

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args);
      const columnHit = pointerHits.find((c) =>
        droppableIds.includes(c.id as BoardColumnId),
      );
      if (columnHit) return [columnHit];
      if (pointerHits.length > 0) return pointerHits;
      const intersections = rectIntersection(args);
      const columnIntersect = intersections.find((c) =>
        droppableIds.includes(c.id as BoardColumnId),
      );
      if (columnIntersect) return [columnIntersect];
      return closestCorners(args);
    },
    [droppableIds],
  );

  function boardColumnForStatus(s: KanbanStatus): BoardColumnId {
    return isEndStatus(s) ? "end" : (s as BoardColumnId);
  }

  function findContainer(id: string): BoardColumnId | undefined {
    if (droppableIds.includes(id as BoardColumnId)) {
      return id as BoardColumnId;
    }
    return boardColumnForStatus(getStatus(id));
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
    const destCol = droppableIds.includes(overId as BoardColumnId)
      ? (overId as BoardColumnId)
      : findContainer(overId);
    if (!destCol) return;

    const current = getStatus(jobId);
    const currentCol = boardColumnForStatus(current);

    if (destCol === "end") {
      if (currentCol === "end" && overId !== "end" && isEndStatus(getStatus(overId))) {
        // Dropped onto another end card — still ask for outcome if moving within end
        // Only prompt when coming from outside end, or always allow re-picking
      }
      if (currentCol !== "end" || overId === "end") {
        setPendingEnd({ jobId, previous: current });
        return;
      }
      // Dropped on an end card while already in end — open modal to reassign outcome
      setPendingEnd({ jobId, previous: current });
      return;
    }

    if (currentCol === destCol && current === destCol) return;
    const nextStatus = destCol as KanbanStatus;
    if (current === nextStatus) return;
    void patch(jobId, { status: nextStatus, visited: true });
  }

  function confirmEnd(status: KanbanStatus) {
    if (!pendingEnd) return;
    const { jobId } = pendingEnd;
    setPendingEnd(null);
    void patch(jobId, { status, visited: true });
  }

  function cancelEnd() {
    // Leave card unmoved — no optimistic change was applied
    setPendingEnd(null);
  }

  const activeJob = activeId ? jobMap.get(activeId) : null;

  return (
    <div className="space-y-6 fade-up">
      <div>
        <div className="eyebrow mb-2">Pipeline</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Kanban</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Drag roles across stages. Drop into End to pick an outcome.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 md:min-h-[calc(100vh-11rem)] md:overflow-x-visible">
          {KANBAN_BOARD_COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              jobs={columns[col.id] ?? []}
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
                status={getStatus(activeJob.id)}
                compact
                showEndBadge={isEndStatus(getStatus(activeJob.id))}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <EndOutcomeModal
        open={Boolean(pendingEnd)}
        onConfirm={confirmEnd}
        onCancel={cancelEnd}
      />

      <JobDrawer
        job={selected}
        open={Boolean(selected)}
        visited={selected ? visitedSet.has(selected.id) : false}
        status={selected ? getStatus(selected.id) : undefined}
        onClose={() => setSelected(null)}
        onMarkVisited={(id) => patch(id, { visited: true })}
        onStatusChange={(id, status) => patch(id, { status, visited: true })}
      />
    </div>
  );
}

