"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Users, X } from "lucide-react";
import clsx from "clsx";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  companyPlan: string;
  storagePlan: string;
  planLabel: string;
  companiesCount: number;
  fetchRunsCount: number;
  bytesUsed: number;
  bytesUsedFormatted: string;
  lastFetchDate: string | null;
  createdAt: string;
};

const COMPANY_PLANS = [
  { id: "free", label: "Free (5)" },
  { id: "cos_20", label: "Companies 20" },
  { id: "cos_45", label: "Companies 45" },
  { id: "cos_100", label: "Companies 100" },
];
const STORAGE_PLANS = [
  { id: "free", label: "Free (2 MB)" },
  { id: "plus", label: "Storage Plus (10 MB)" },
];

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Calcutta",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type EditForm = {
  name: string;
  phone: string;
  role: string;
  companyPlan: string;
  storagePlan: string;
};

function EditUserModal({
  row,
  onClose,
  onSaved,
}: {
  row: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name: row.name,
    phone: row.phone,
    role: row.role,
    companyPlan: row.companyPlan === "unlimited" ? "free" : row.companyPlan,
    storagePlan: row.storagePlan === "unlimited" ? "free" : row.storagePlan,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdminRow = row.role === "admin";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save changes.");
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error.");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Edit {row.email}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[var(--text-dim)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-dim)]">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-dim)]">Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-dim)]">Role</span>
            <select
              value={form.role}
              disabled={isAdminRow}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className={clsx(inputClass, isAdminRow && "opacity-50")}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            {isAdminRow && (
              <span className="text-xs text-[var(--text-dim)]">
                The protected admin account cannot be demoted here.
              </span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-dim)]">Company plan</span>
            <select
              value={form.companyPlan}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyPlan: e.target.value }))
              }
              className={inputClass}
            >
              {COMPANY_PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-dim)]">Storage plan</span>
            <select
              value={form.storagePlan}
              onChange={(e) =>
                setForm((f) => ({ ...f, storagePlan: e.target.value }))
              }
              className={inputClass}
            >
              {STORAGE_PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-1.5 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteUserModal({
  row,
  onClose,
  onDeleted,
}: {
  row: AdminUserRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText.trim().toLowerCase() === row.email.toLowerCase();

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete user.");
        setDeleting(false);
        return;
      }
      onDeleted();
      onClose();
    } catch {
      setError("Network error.");
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--danger)]">
          Delete {row.email}?
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This permanently deletes their account, companies, profile, resume,
          fetch history and every daily digest. This cannot be undone and
          frees any storage they were using.
        </p>
        <label className="mt-4 block space-y-1">
          <span className="text-xs text-[var(--text-dim)]">
            Type <strong>{row.email}</strong> to confirm
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--danger)]"
          />
        </label>

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDelete || deleting}
            onClick={() => void doDelete()}
            className="rounded-full border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.12)] px-4 py-1.5 text-sm font-medium text-[var(--danger)] disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersView() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        setError("Admin only");
        setRows([]);
        return;
      }
      if (!res.ok) {
        setError("Failed to load users");
        return;
      }
      const data = (await res.json()) as { users: AdminUserRow[] };
      setRows(data.users ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Admin</div>
          <h1 className="prose-title text-3xl sm:text-4xl">Users</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            All registered accounts — plans, companies, fetch history, and
            storage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Loading users…
        </div>
      ) : error ? (
        <div className="glass px-6 py-10 text-center text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-[var(--text-dim)]" />
          <p className="text-sm text-[var(--text-muted)]">No users found.</p>
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-dim)]">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold tabular-nums">Cos</th>
                  <th className="px-4 py-3 font-semibold tabular-nums">
                    Fetches
                  </th>
                  <th className="px-4 py-3 font-semibold">Storage</th>
                  <th className="px-4 py-3 font-semibold">Last fetch</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] last:border-b-0 transition hover:bg-[rgba(45,212,191,0.04)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {row.name || "—"}
                      {row.role === "admin" && (
                        <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-[var(--accent)]">
                          admin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {row.email}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                      {row.phone || (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      <span
                        className={clsx(
                          row.role === "admin" && "text-[var(--accent)]",
                        )}
                      >
                        {row.planLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                      {row.companiesCount}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                      {row.fetchRunsCount}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                      {row.bytesUsedFormatted}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                      {row.lastFetchDate ?? (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-dim)]">
                      {formatCreated(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          title="Edit user"
                          className="rounded-full border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(row)}
                          disabled={row.role === "admin"}
                          title={
                            row.role === "admin"
                              ? "Admin accounts cannot be deleted"
                              : "Delete user"
                          }
                          className="rounded-full border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:border-[rgba(248,113,113,0.4)] hover:text-[var(--danger)] disabled:opacity-30"
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

      {editing && (
        <EditUserModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
      {deleting && (
        <DeleteUserModal
          row={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => void refresh()}
        />
      )}
    </div>
  );
}
