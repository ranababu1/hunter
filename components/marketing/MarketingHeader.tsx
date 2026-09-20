"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ArrowRight, Crosshair, Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function MarketingHeader({ authed }: { authed: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(13,17,23,0.9)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid rgba(45,212,191,0.35)",
            }}
          >
            <Crosshair className="h-4 w-4" style={{ color: "var(--accent)" }} />
          </div>
          <span className="wordmark text-lg">Hunter</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1 md:flex">
          {links.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "rounded-full px-3.5 py-1.5 text-sm transition",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authed ? (
            <Link
              href="/daily"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-[#0d1117]"
              style={{ background: "var(--accent)" }}
            >
              Open app
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-[#0d1117]"
                style={{ background: "var(--accent)" }}
              >
                Start free
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm",
                  pathname === href
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex gap-2">
            {authed ? (
              <Link
                href="/daily"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium text-[#0d1117]"
                style={{ background: "var(--accent)" }}
              >
                Open app
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-center text-sm text-[var(--text-muted)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium text-[#0d1117]"
                  style={{ background: "var(--accent)" }}
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
