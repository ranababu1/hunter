"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
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

export function UsersView() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
