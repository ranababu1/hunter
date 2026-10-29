"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import type { Job, KanbanStatus, MatchLevel } from "@/lib/types";
import { ALL_STATUSES, END_OUTCOMES, isEndStatus } from "@/lib/types";

export interface KanbanFilterState {
  q: string;
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  matches: MatchLevel[];
  companies: string[];
  statuses: KanbanStatus[];
  locations: string[];
  levels: string[];
  newOnly: boolean;
  unvisitedOnly: boolean;
}

export const EMPTY_FILTERS: KanbanFilterState = {
  q: "",
  from: "",
  to: "",
  matches: [],
  companies: [],
  statuses: [],
  locations: [],
  levels: [],
  newOnly: false,
  unvisitedOnly: false,
};

const STORAGE_KEY = "hunter.kanban.filters.v1";
const MATCHES: MatchLevel[] = ["Strong Match", "Good Match", "Possible Match"];

export function filtersActive(f: KanbanFilterState): boolean {
  return (
    f.q.trim() !== "" ||
    f.from !== "" ||
    f.to !== "" ||
    f.matches.length > 0 ||
    f.companies.length > 0 ||
    f.statuses.length > 0 ||
    f.locations.length > 0 ||
    f.levels.length > 0 ||
    f.newOnly ||
    f.unvisitedOnly
  );
}

/** Normalise a job date field to YYYY-MM-DD, or "" if unknown. */
export function jobDate(job: Job): string {
  for (const raw of [job.dateSeen, job.postedOrUpdated]) {
    if (!raw) continue;
    const m = /\d{4}-\d{2}-\d{2}/.exec(raw);
    if (m) return m[0];
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}

export function applyKanbanFilters(
  jobs: Job[],
  f: KanbanFilterState,
  getStatus: (id: string) => KanbanStatus,
  visited: Set<string>,
): Job[] {
  const q = f.q.trim().toLowerCase();
  return jobs.filter((j) => {
    if (f.matches.length && !f.matches.includes(j.match)) return false;
    if (f.companies.length && !f.companies.includes(j.company)) return false;
    if (f.locations.length && !f.locations.includes(j.location)) return false;
    if (f.levels.length && !f.levels.includes(j.level)) return false;
    if (f.statuses.length && !f.statuses.includes(getStatus(j.id))) return false;
    if (f.newOnly && !j.isNew) return false;
    if (f.unvisitedOnly && visited.has(j.id)) return false;
    if (f.from || f.to) {
      const d = jobDate(j);
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    if (q) {
      const hay = [j.company, j.role, j.aiFocus, j.location, j.level, j.whyMatch]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sanitize(raw: unknown): KanbanFilterState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    q: typeof o.q === "string" ? o.q : "",
    from: typeof o.from === "string" ? o.from : "",
    to: typeof o.to === "string" ? o.to : "",
    matches: arr(o.matches).filter((m): m is MatchLevel =>
      (MATCHES as string[]).includes(m),
    ),
    companies: arr(o.companies),
    statuses: arr(o.statuses) as KanbanStatus[],
    locations: arr(o.locations),
    levels: arr(o.levels),
    newOnly: o.newOnly === true,
    unvisitedOnly: o.unvisitedOnly === true,
  };
}

/** Filters persisted in localStorage (survives reloads, per browser). */
export function usePersistentKanbanFilters() {
  const [filters, setFilters] = useState<KanbanFilterState>(EMPTY_FILTERS);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFilters(sanitize(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);
  return [filters, setFilters] as const;
}

const chip = (on: boolean) =>
  clsx(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
    on
      ? "border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
  );

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const shown = options.filter((o) =>
    o.label.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={chip(selected.length > 0)}
        aria-expanded={open}
      >
        {label}
        {selected.length ? ` · ${selected.length}` : ""} ▾
      </button>
      {open ? (
        <div className="glass absolute left-0 z-40 mt-2 w-64 p-2 shadow-2xl">
          {options.length > 8 ? (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="mb-2 w-full rounded-lg border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
            />
          ) : null}
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-2 py-2 text-xs text-[var(--text-dim)]">No options</div>
            ) : (
              shown.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => onChange(toggle(selected, o.value))}
                    className="accent-[var(--accent)]"
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined ? (
                    <span className="tabular-nums text-[10px] text-[var(--text-dim)]">
                      {o.count}
                    </span>
                  ) : null}
                </label>
              ))
            )}
          </div>
          {selected.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function countBy(jobs: Job[], key: (j: Job) => string) {
  const m = new Map<string, number>();
  for (const j of jobs) {
    const k = key(j);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

export function KanbanFilterBar({
  jobs,
  filters,
  setFilters,
  shown,
  getStatus,
}: {
  jobs: Job[];
  filters: KanbanFilterState;
  setFilters: (f: KanbanFilterState) => void;
  shown: number;
  getStatus: (id: string) => KanbanStatus;
}) {
  const companies = useMemo(() => countBy(jobs, (j) => j.company), [jobs]);
  const locations = useMemo(() => countBy(jobs, (j) => j.location), [jobs]);
  const levels = useMemo(() => countBy(jobs, (j) => j.level), [jobs]);
  const statusOpts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const s = getStatus(j.id);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return ALL_STATUSES.map((s) => ({
      value: s.id,
      label: isEndStatus(s.id)
        ? `End · ${END_OUTCOMES.find((o) => o.id === s.id)?.label ?? s.id}`
        : s.label,
      count: counts.get(s.id) ?? 0,
    }));
  }, [jobs, getStatus]);
  const set = (p: Partial<KanbanFilterState>) => setFilters({ ...filters, ...p });
  const active = filtersActive(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search company, role, focus, location…"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <label className="flex items-center gap-1.5">
            From
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set({ from: e.target.value })}
              className="rounded-lg border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] px-2 py-1.5 text-xs outline-none [color-scheme:dark] focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
              className="rounded-lg border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] px-2 py-1.5 text-xs outline-none [color-scheme:dark] focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {MATCHES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set({ matches: toggle(filters.matches, m) })}
            className={chip(filters.matches.includes(m))}
          >
            {m}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--border)]" />
        <MultiSelect
          label="Company"
          options={companies}
          selected={filters.companies}
          onChange={(v) => set({ companies: v })}
        />
        <MultiSelect
          label="Status"
          options={statusOpts}
          selected={filters.statuses}
          onChange={(v) => set({ statuses: v as KanbanStatus[] })}
        />
        <MultiSelect
          label="Location"
          options={locations}
          selected={filters.locations}
          onChange={(v) => set({ locations: v })}
        />
        <MultiSelect
          label="Level"
          options={levels}
          selected={filters.levels}
          onChange={(v) => set({ levels: v })}
        />
        <button
          type="button"
          onClick={() => set({ newOnly: !filters.newOnly })}
          className={chip(filters.newOnly)}
        >
          New only
        </button>
        <button
          type="button"
          onClick={() => set({ unvisitedOnly: !filters.unvisitedOnly })}
          className={chip(filters.unvisitedOnly)}
        >
          Unvisited
        </button>
        <span className="ml-auto flex items-center gap-2 text-xs text-[var(--text-dim)]">
          <span className="tabular-nums">
            {shown} of {jobs.length} roles
          </span>
          {active ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
