"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { CompanyPriority, CompanyProfile } from "@/lib/types";
import { COMPANY_PRIORITIES } from "@/lib/types";

type SortKey = "name" | "priority";

const PRIORITY_ORDER: Record<CompanyPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type FormState = {
  name: string;
  valuation: string;
  headcount: string;
  bangaloreArea: string;
  industry: string;
  careersUrl: string;
  priority: CompanyPriority;
  notes: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  valuation: "",
  headcount: "",
  bangaloreArea: "",
  industry: "",
  careersUrl: "",
  priority: "medium",
  notes: "",
  active: true,
});

function fromCompany(c: CompanyProfile): FormState {
  return {
    name: c.name,
    valuation: c.valuation,
    headcount: c.headcount,
    bangaloreArea: c.bangaloreArea,
    industry: c.industry,
    careersUrl: c.careersUrl,
    priority: c.priority,
    notes: c.notes,
    active: c.active,
  };
}

function PriorityBadge({ priority }: { priority: CompanyPriority }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
        priority === "high" &&
          "bg-[rgba(63,185,80,0.15)] text-[var(--strong)]",
        priority === "medium" &&
          "bg-[rgba(210,153,34,0.15)] text-[var(--good)]",
        priority === "low" &&
          "bg-[rgba(110,118,129,0.2)] text-[var(--text-muted)]",
      )}
    >
      {priority === "medium" ? "Med" : priority}
    </span>
  );
}

export function CompaniesView() {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redisAvailable, setRedisAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [modal, setModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; company: CompanyProfile }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      const data = (await res.json()) as {
        companies: CompanyProfile[];
        redisAvailable?: boolean;
      };
      setCompanies(data.companies ?? []);
      setRedisAvailable(data.redisAvailable !== false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!modal && !deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, deleteTarget]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = companies;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q) ||
          c.bangaloreArea.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (sortKey === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => {
        const d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });
    }
    return sorted;
  }, [companies, query, sortKey]);

  function openAdd() {
    setForm(emptyForm());
    setFormError(null);
    setModal({ mode: "add" });
  }

  function openEdit(company: CompanyProfile) {
    setForm(fromCompany(company));
    setFormError(null);
    setModal({ mode: "edit", company });
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Company name is required");
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      ...form,
      name: form.name.trim(),
    };

    const optimisticId =
      modal?.mode === "edit" ? modal.company.id : `tmp-${Date.now()}`;
    const optimistic: CompanyProfile = {
      id: optimisticId,
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    const prev = companies;
    if (modal?.mode === "edit") {
      setCompanies(
        companies.map((c) => (c.id === modal.company.id ? optimistic : c)),
      );
    } else {
      setCompanies(
        [...companies, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
    }

    try {
      const res = await fetch("/api/companies", {
        method: modal?.mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modal?.mode === "edit"
            ? { id: modal.company.id, ...payload }
            : payload,
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        companies?: CompanyProfile[];
      };
      if (!res.ok) {
        setCompanies(prev);
        setFormError(data.error ?? "Save failed");
        return;
      }
      if (data.companies) setCompanies(data.companies);
      else await refresh();
      setModal(null);
    } catch {
      setCompanies(prev);
      setFormError("Network error — could not save");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const prev = companies;
    const id = deleteTarget.id;
    setCompanies(companies.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/companies?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        error?: string;
        companies?: CompanyProfile[];
      };
      if (!res.ok) {
        setCompanies(prev);
        setError(data.error ?? "Delete failed");
        return;
      }
      if (data.companies) setCompanies(data.companies);
      setDeleteTarget(null);
    } catch {
      setCompanies(prev);
      setError("Network error — could not delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow mb-2">Targets</div>
          <h1 className="prose-title text-3xl sm:text-4xl">Companies</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Track valuation, headcount, Bengaluru office areas, and fetch
            priority. Edits persist in Redis.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[rgba(45,212,191,0.2)]"
        >
          <Plus className="h-4 w-4" />
          Add company
        </button>
      </div>

      {!redisAvailable && (
        <div className="glass rounded-xl border border-[rgba(210,153,34,0.35)] px-4 py-3 text-sm text-[var(--good)]">
          Redis not configured — showing seed data (read-only). Mutations will
          return 503 until Upstash env vars are set.
        </div>
      )}

      {error && (
        <div className="glass rounded-xl border border-[rgba(248,81,73,0.35)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, industry, area…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-10 pr-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-dim)]">Sort</span>
          <div className="flex rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            {(
              [
                ["name", "Name"],
                ["priority", "Priority"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={clsx(
                  "rounded-full px-3 py-1 transition",
                  sortKey === key
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="tabular-nums text-[var(--text-dim)]">
            {filtered.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Loading companies…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid rgba(45,212,191,0.35)",
            }}
          >
            <Building2 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="font-medium text-[var(--text)]">
              {query ? "No matches" : "No companies yet"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {query
                ? "Try a different search."
                : "Add your first target company to get started."}
            </p>
          </div>
          {!query && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)]"
            >
              <Plus className="h-4 w-4" />
              Add company
            </button>
          )}
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-dim)]">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Valuation</th>
                  <th className="px-4 py-3 font-semibold">Headcount</th>
                  <th className="px-4 py-3 font-semibold">BLR area</th>
                  <th className="px-4 py-3 font-semibold">Industry</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] last:border-b-0 transition hover:bg-[rgba(45,212,191,0.04)]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text)]">
                          {row.name}
                        </span>
                        {row.careersUrl ? (
                          <a
                            href={row.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent)] opacity-80 hover:opacity-100"
                            title={row.careersUrl}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-[var(--text-muted)]">
                      <span className="line-clamp-2">
                        {row.valuation || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                      {row.headcount || "—"}
                    </td>
                    <td className="max-w-[160px] px-4 py-3 text-[var(--text-muted)]">
                      <span className="line-clamp-2">
                        {row.bangaloreArea || "—"}
                      </span>
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-[var(--text-muted)]">
                      <span className="line-clamp-2">
                        {row.industry || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={row.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          row.active
                            ? "bg-[var(--strong)] shadow-[0_0_8px_rgba(63,185,80,0.5)]"
                            : "bg-[var(--text-dim)]",
                        )}
                        title={row.active ? "Active" : "Inactive"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[rgba(248,81,73,0.45)] hover:text-[var(--danger)]"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModal(null)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <div
                className="glass my-4 w-full max-w-lg rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                  <h2 className="prose-title text-xl">
                    {modal.mode === "add" ? "Add company" : "Edit company"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={submitForm} className="space-y-4 px-5 py-5">
                  {(
                    [
                      ["name", "Company name", "text", true],
                      ["valuation", "Valuation", "text", false],
                      ["headcount", "Headcount", "text", false],
                      ["bangaloreArea", "Bangalore office area", "text", false],
                      ["industry", "Industry / focus", "text", false],
                      ["careersUrl", "Careers URL", "url", false],
                    ] as const
                  ).map(([key, label, type, required]) => (
                    <label key={key} className="block space-y-1.5">
                      <span className="eyebrow">{label}</span>
                      <input
                        type={type}
                        required={required}
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        placeholder={
                          key === "valuation"
                            ? 'e.g. "$3T" or "Series D · $2.1B"'
                            : key === "headcount"
                              ? 'e.g. "~180k"'
                              : key === "bangaloreArea"
                                ? "e.g. Electronic City, Whitefield"
                                : undefined
                        }
                      />
                    </label>
                  ))}

                  <div className="grid grid-cols-2 gap-4">
                    <label className="block space-y-1.5">
                      <span className="eyebrow">Priority</span>
                      <select
                        value={form.priority}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            priority: e.target.value as CompanyPriority,
                          }))
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                      >
                        {COMPANY_PRIORITIES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-2">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, active: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                      />
                      <span className="text-sm text-[var(--text-muted)]">
                        Active (include in morning fetch)
                      </span>
                    </label>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="eyebrow">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={3}
                      className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>

                  {formError && (
                    <p className="text-sm text-[var(--danger)]">{formError}</p>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
                    >
                      {saving
                        ? "Saving…"
                        : modal.mode === "add"
                          ? "Create"
                          : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <div
                className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="prose-title text-xl">Remove company?</h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Delete{" "}
                  <span className="font-medium text-[var(--text)]">
                    {deleteTarget.name}
                  </span>{" "}
                  from the list? This cannot be undone.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                    className="rounded-full border border-[rgba(248,81,73,0.45)] bg-[rgba(248,81,73,0.12)] px-4 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-50"
                  >
                    {deleting ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
