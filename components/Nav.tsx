"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Crosshair,
  LayoutGrid,
  Columns3,
  Newspaper,
  Radio,
  Building2,
  LogOut,
  User,
  CreditCard,
} from "lucide-react";

const links = [
  { href: "/", label: "Daily", icon: Newspaper },
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/kanban", label: "Kanban", icon: Columns3 },
  { href: "/fetches", label: "Fetches", icon: Radio },
  { href: "/companies", label: "Companies", icon: Building2 },
];

type MeUser = { email: string; name: string; role: string };

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = (await res.json()) as { user?: MeUser };
        if (!cancelled && data.user) setUser(data.user);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(13,17,23,0.92)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-none items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
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

        <nav className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition sm:px-3",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user && (
            <span
              className="hidden max-w-[140px] truncate text-xs text-[var(--text-dim)] lg:inline"
              title={user.email}
            >
              {user.email}
            </span>
          )}
          <Link
            href="/profile"
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition",
              pathname.startsWith("/profile")
                ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
            title="Profile"
          >
            <User className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Profile</span>
          </Link>
          <Link
            href="/billing"
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition",
              pathname.startsWith("/billing")
                ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
            title="Billing"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Billing</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
