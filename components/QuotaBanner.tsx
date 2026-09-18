"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatBytes } from "@/lib/plans";

type Props = {
  bytesUsed: number;
  maxStorageBytes: number;
  companyCount?: number;
  maxCompanies?: number;
};

export function QuotaBanner({
  bytesUsed,
  maxStorageBytes,
  companyCount,
  maxCompanies,
}: Props) {
  const storageRatio =
    maxStorageBytes > 0 ? bytesUsed / maxStorageBytes : 0;
  const atStorage = storageRatio >= 1;
  const nearStorage = storageRatio >= 0.9;
  const atCompanies =
    typeof maxCompanies === "number" &&
    maxCompanies > 0 &&
    typeof companyCount === "number" &&
    companyCount >= maxCompanies;

  if (!nearStorage && !atStorage && !atCompanies) return null;

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: atStorage || atCompanies
          ? "rgba(248,81,73,0.45)"
          : "rgba(210,153,34,0.45)",
        background:
          atStorage || atCompanies
            ? "rgba(248,81,73,0.08)"
            : "rgba(210,153,34,0.08)",
        color: atStorage || atCompanies ? "var(--danger)" : "var(--good)",
      }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {atStorage ? (
            <p>
              Free tier maxxed out. Continue for $10/mo —{" "}
              {formatBytes(bytesUsed)} / {formatBytes(maxStorageBytes)} used.
            </p>
          ) : nearStorage ? (
            <p>
              Storage nearly full: {formatBytes(bytesUsed)} /{" "}
              {formatBytes(maxStorageBytes)} ({Math.round(storageRatio * 100)}
              %).
            </p>
          ) : null}
          {atCompanies ? (
            <p className={nearStorage || atStorage ? "mt-1" : undefined}>
              Company limit reached ({companyCount} / {maxCompanies}). Upgrade
              for $5/20, $10/45, or $20/100.
            </p>
          ) : null}
        </div>
      </div>
      <Link
        href="/billing"
        className="shrink-0 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-3 py-1.5 text-center text-xs font-medium text-[var(--accent)]"
      >
        View billing
      </Link>
    </div>
  );
}
