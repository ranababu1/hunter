"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { CompanyPriority, CompanyProfile } from "@/lib/types";
import { COMPANY_PRIORITIES } from "@/lib/types";
import Link from "next/link";
import { QuotaBanner } from "@/components/QuotaBanner";
import { useMe } from "@/components/MeProvider";
import { canonicalizeImportMapping } from "@/lib/import-hash";

type SortKey = "name" | "priority";

type ImportSummary = {
  imported: number;
  updated: number;
  skipped: { name: string; reason: string }[];
  problematic: number;
};

async function sha256Hex(textValue: string): Promise<string> {
  const data = new TextEncoder().encode(textValue);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashImportMappingClient(
  mapping: Record<string, unknown>,
): Promise<string> {
  return sha256Hex(canonicalizeImportMapping(mapping));
}


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

function CompanyTable({
  rows,
  showIssue = false,
  onEdit,
  onDelete,
}: {
  rows: CompanyProfile[];
  showIssue?: boolean;
  onEdit: (company: CompanyProfile) => void;
  onDelete: (company: CompanyProfile) => void;
}) {
  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-dim)]">
              <th className="px-4 py-3 font-semibold">Name</th>
              {showIssue ? (
                <th className="px-4 py-3 font-semibold">Issue</th>
              ) : null}
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
            {rows.map((row) => (
              <tr
                key={row.id}
                className={clsx(
                  "border-b last:border-b-0 transition",
                  showIssue
                    ? "border-[rgba(210,153,34,0.35)] bg-[rgba(210,153,34,0.08)] hover:bg-[rgba(210,153,34,0.14)]"
                    : "border-[var(--border)] hover:bg-[rgba(45,212,191,0.04)]",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--text)]">
                      {row.name}
                    </span>
                    {showIssue ? (
                      <span
                        className="inline-flex rounded-full border border-[rgba(210,153,34,0.45)] bg-[rgba(210,153,34,0.15)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--good)]"
                        title={row.portalIssue || "Portal check failed"}
                      >
                        Portal issue
                      </span>
                    ) : null}
                    {row.careersUrl ? (
                      <a
                        href={row.careersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] opacity-80 hover:opacity-100"
                        title={
                          showIssue && row.portalIssue
                            ? `${row.portalIssue} — ${row.careersUrl}`
                            : row.careersUrl
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </td>
                {showIssue ? (
                  <td className="max-w-[260px] px-4 py-3 text-[var(--good)]">
                    <span className="line-clamp-2">
                      {row.portalIssue || "Portal check failed"}
                    </span>
                  </td>
                ) : null}
                <td className="max-w-[140px] px-4 py-3 text-[var(--text-muted)]">
                  <span className="line-clamp-2">{row.valuation || "—"}</span>
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
                  <span className="line-clamp-2">{row.industry || "—"}</span>
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
                      onClick={() => onEdit(row)}
                      className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
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
  );
}

export function CompaniesView() {
  const { me, refreshMe } = useMe();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redisAvailable, setRedisAvailable] = useState(true);
  const [maxCompanies, setMaxCompanies] = useState(5);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [maxStorageBytes, setMaxStorageBytes] = useState(2 * 1024 * 1024);
  const [limitNudge, setLimitNudge] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [modal, setModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; company: CompanyProfile }
    | { mode: "import" }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [validatePortals, setValidatePortals] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [lastImportedHash, setLastImportedHash] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      const data = (await res.json()) as {
        companies: CompanyProfile[];
        redisAvailable?: boolean;
        entitlements?: { maxCompanies?: number };
      };
      setCompanies(data.companies ?? []);
      setRedisAvailable(data.redisAvailable !== false);
      if (data.entitlements?.maxCompanies != null) {
        const m = data.entitlements.maxCompanies;
        setMaxCompanies(m < 0 ? Number.POSITIVE_INFINITY : m);
      }
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

  // Sync entitlements / usage from shared MeProvider (single /api/me fetch)
  useEffect(() => {
    if (!me) return;
    if (me.usage?.bytesUsed != null) setBytesUsed(me.usage.bytesUsed);
    if (me.entitlements?.maxStorageBytes != null) {
      setMaxStorageBytes(me.entitlements.maxStorageBytes);
    }
    if (me.entitlements?.maxCompanies != null) {
      const m = me.entitlements.maxCompanies;
      setMaxCompanies(m < 0 ? Number.POSITIVE_INFINITY : m);
    }
  }, [me]);

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

  const okRows = useMemo(
    () => filtered.filter((company) => company.portalOk !== false),
    [filtered],
  );
  const issueRows = useMemo(
    () => filtered.filter((company) => company.portalOk === false),
    [filtered],
  );

  function openAdd() {
    if (
      Number.isFinite(maxCompanies) &&
      companies.length >= maxCompanies
    ) {
      setLimitNudge(
        `Company limit reached (${companies.length} / ${maxCompanies}). Upgrade for $5/20, $10/45, or $20/100.`,
      );
      return;
    }
    setLimitNudge(null);
    setForm(emptyForm());
    setFormError(null);
    setModal({ mode: "add" });
  }

  function openEdit(company: CompanyProfile) {
    setForm(fromCompany(company));
    setFormError(null);
    setModal({ mode: "edit", company });
  }

  function openImport() {
    setImportText("");
    setImportError(null);
    setImportSummary(null);
    setValidatePortals(false);
    setModal({ mode: "import" });
  }

  function onImportFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const textValue = typeof reader.result === "string" ? reader.result : "";
      setImportText(textValue);
      setImportError(null);
      setImportSummary(null);
    };
    reader.onerror = () => {
      setImportError("Could not read the selected file.");
    };
    reader.readAsText(file);
  }

  function validateImportMapping(parsed: unknown): string | null {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Import JSON must be an object (not an array) mapping company names to URLs.";
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      return "JSON object is empty — add at least one company name → URL pair.";
    }
    for (const [key, value] of entries) {
      if (typeof key !== "string" || !key.trim()) {
        return "Every company name (key) must be a non-empty string.";
      }
      if (typeof value !== "string" || !value.trim()) {
        return `URL for "${key}" must be a non-empty string.`;
      }
      if (!/^https?:\/\//i.test(value.trim())) {
        return `URL for "${key}" must start with http:// or https://.`;
      }
    }
    return null;
  }

  async function runEnrich(companyIds?: string[]) {
    setEnriching(true);
    setEnrichMessage(null);
    try {
      const res = await fetch("/api/companies/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyIds ? { companyIds } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        companies?: CompanyProfile[];
        updated?: number;
        unchanged?: number;
      };
      if (!res.ok) {
        setEnrichMessage(data.error ?? "Enrichment failed");
        return;
      }
      if (data.companies) setCompanies(data.companies);
      const n = data.updated ?? 0;
      setEnrichMessage(
        n > 0 ? `Updated ${n} companies` : "No metadata changes",
      );
      await refreshMe();
    } catch {
      setEnrichMessage("Network error — could not enrich companies.");
    } finally {
      setEnriching(false);
    }
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError("Enter valid JSON before importing.");
      return;
    }
    const formatError = validateImportMapping(parsed);
    if (formatError) {
      setImportError(formatError);
      return;
    }

    const mapping = parsed as Record<string, unknown>;
    let clientHash: string | null = null;
    try {
      clientHash = await hashImportMappingClient(mapping);
    } catch {
      // Web Crypto unavailable — server still enforces duplicates
    }
    if (clientHash && lastImportedHash && clientHash === lastImportedHash) {
      setImportError(
        "This company list was already imported. Edit the JSON or choose a different file.",
      );
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/companies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          validatePortals,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        companies?: CompanyProfile[];
        imported?: number;
        updated?: number;
        skipped?: { name: string; reason: string }[];
        problematic?: number;
        importHash?: string;
      };
      if (data.error === "DUPLICATE_IMPORT" || res.status === 409) {
        setImportError(
          data.message ??
            "This company list was already imported.",
        );
        if (data.importHash) setLastImportedHash(data.importHash);
        else if (clientHash) setLastImportedHash(clientHash);
        return;
      }
      if (data.companies) setCompanies(data.companies);
      if (data.imported != null || data.updated != null || data.skipped) {
        setImportSummary({
          imported: data.imported ?? 0,
          updated: data.updated ?? 0,
          skipped: data.skipped ?? [],
          problematic: data.problematic ?? 0,
        });
      }
      if (!res.ok) {
        setImportError(data.message ?? data.error ?? "Import failed");
        return;
      }
      const hash = data.importHash ?? clientHash;
      if (hash) setLastImportedHash(hash);
      if (importFileRef.current) importFileRef.current.value = "";
      await refreshMe();

      // Enrich newly imported/updated companies (match by name from mapping)
      const names = new Set(
        Object.keys(mapping)
          .map((n) => n.trim().toLowerCase())
          .filter(Boolean),
      );
      const list = data.companies ?? [];
      const ids = list
        .filter((c) => names.has(c.name.trim().toLowerCase()))
        .map((c) => c.id);
      if (ids.length > 0) {
        void runEnrich(ids);
      }
    } catch {
      setImportError("Network error — could not import companies.");
    } finally {
      setImporting(false);
    }
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
        const errData = data as {
          error?: string;
          kind?: string;
          message?: string;
          limit?: number;
          used?: number;
        };
        if (errData.error === "PLAN_LIMIT") {
          setFormError(
            errData.message ??
              `Company limit reached (${errData.used} / ${errData.limit}). Upgrade for $5/20, $10/45, or $20/100.`,
          );
          setLimitNudge(
            errData.message ??
              `Company limit reached. Upgrade tiers: $5 → 20, $10 → 45, $20 → 100.`,
          );
        } else if (errData.error === "QUOTA_EXCEEDED") {
          setFormError(
            errData.message ?? "Free tier maxxed out. Continue for $10/mo",
          );
        } else {
          setFormError(data.error ?? "Save failed");
        }
        return;
      }
      if (data.companies) setCompanies(data.companies);
      else await refresh();
      await refreshMe();
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
      await refreshMe();
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
            Track valuation, headcount, office locations, and fetch
            priority. Edits persist in Redis.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="tabular-nums text-sm text-[var(--text-dim)]">
            {companies.length}
            {Number.isFinite(maxCompanies) ? ` / ${maxCompanies}` : " / ∞"}{" "}
            companies
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void runEnrich()}
              disabled={enriching || companies.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
              title="Fill empty metadata from the built-in company seed"
            >
              <RefreshCw className={clsx("h-4 w-4", enriching && "animate-spin")} />
              {enriching ? "Rechecking…" : "Recheck company metadata"}
            </button>
            <button
              type="button"
              onClick={openImport}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              <Upload className="h-4 w-4" />
              Import JSON
            </button>
            <button
              type="button"
              onClick={openAdd}
              disabled={
                Number.isFinite(maxCompanies) &&
                companies.length >= maxCompanies
              }
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[rgba(45,212,191,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Add company
            </button>
          </div>
        </div>
      </div>

      <QuotaBanner
        bytesUsed={bytesUsed}
        maxStorageBytes={maxStorageBytes}
        companyCount={companies.length}
        maxCompanies={
          Number.isFinite(maxCompanies) ? maxCompanies : undefined
        }
      />

      {limitNudge && (
        <div className="glass rounded-xl border border-[rgba(210,153,34,0.35)] px-4 py-3 text-sm text-[var(--good)]">
          {limitNudge}{" "}
          <Link href="/billing" className="text-[var(--accent)] underline">
            View billing
          </Link>
        </div>
      )}

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

      {enrichMessage && (
        <div className="glass rounded-xl border border-[rgba(45,212,191,0.35)] px-4 py-3 text-sm text-[var(--accent)]">
          {enrichMessage}
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
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
            {okRows.length} ok · {issueRows.length} issues
          </span>
        </div>
      </div>

      {loading ? (
        <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Loading companies…
        </div>
      ) : companies.length === 0 ? (
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
            <p className="font-medium text-[var(--text)]">No matches</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Try a different search.
            </p>
          </div>
        </div>
      ) : (
        <>
          {okRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No healthy portals.</p>
          ) : (
            <CompanyTable
              rows={okRows}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          )}

          {issueRows.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => setIssuesOpen((open) => !open)}
                className="glass mt-3 flex w-full items-center justify-between gap-3 rounded-[var(--radius)] px-4 py-3 text-left transition hover:border-[var(--border-strong)]"
                aria-expanded={issuesOpen}
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">
                    Issues
                    <span className="ml-2 font-normal tabular-nums text-[var(--text-dim)]">
                      ({issueRows.length})
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Portal check failures — still imported, fix careers URL when you can
                  </p>
                </div>
                <ChevronDown
                  className={clsx(
                    "h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform",
                    issuesOpen && "rotate-180",
                  )}
                />
              </button>
              {issuesOpen ? (
                <div className="mt-3">
                  <CompanyTable
                    rows={issueRows}
                    showIssue
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <AnimatePresence>
        {modal && modal.mode !== "import" && (
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
        {modal?.mode === "import" && (
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
                className="glass my-4 w-full max-w-2xl rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                  <div>
                    <h2 className="prose-title text-xl">Import companies</h2>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Map each company name to its careers or job-board URL.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={submitImport} className="space-y-4 px-5 py-5">
                  <label className="block space-y-1.5">
                    <span className="eyebrow">Upload .json file</span>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        onImportFile(file);
                        // Keep selection so we can clear the input after success;
                        // allow re-pick of same path by clearing only after import.
                      }}
                      className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text)] hover:file:border-[var(--border-strong)]"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="eyebrow">JSON mapping</span>
                    <textarea
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value);
                        setImportError(null);
                      }}
                      rows={10}
                      spellCheck={false}
                      placeholder={'{\n  "NVIDIA": "https://nvidia.wd5.myworkdayjobs.com/...",\n  "Google": "https://www.google.com/about/careers/"\n}'}
                      className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                    <input
                      type="checkbox"
                      checked={validatePortals}
                      onChange={(e) => setValidatePortals(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-[var(--text)]">
                        Validate job portal URLs
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        Checks each link; bad ones still import but are flagged.
                      </span>
                    </span>
                  </label>

                  {importError && (
                    <p className="text-sm text-[var(--danger)]">{importError}</p>
                  )}

                  {importSummary && (
                    <div className="rounded-xl border border-[rgba(45,212,191,0.3)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
                      <p className="font-medium text-[var(--text)]">
                        Imported {importSummary.imported}, updated{" "}
                        {importSummary.updated}, skipped{" "}
                        {importSummary.skipped.length}
                        {importSummary.problematic > 0
                          ? `, problematic ${importSummary.problematic}`
                          : ""}
                        .
                      </p>
                      {importSummary.skipped.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                          {importSummary.skipped.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                              {item.name || "(blank name)"}: {item.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={importing || !importText.trim()}
                      className="rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
                    >
                      {importing
                        ? validatePortals
                          ? "Checking & importing…"
                          : "Importing…"
                        : "Import"}
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
