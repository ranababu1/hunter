"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, Crosshair } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = legacy
        ? { password }
        : { email: email.trim(), password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      const from = params.get("from") || "/";
      router.replace(from);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass w-full max-w-md p-8 sm:p-10">
      <div className="mb-8 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid rgba(45,212,191,0.35)",
          }}
        >
          <Crosshair className="h-5 w-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <div className="wordmark text-2xl">Hunter</div>
          <div className="eyebrow mt-1">Multi-user portal</div>
        </div>
      </div>

      <h1 className="prose-title mb-2 text-2xl text-[var(--text)]">Sign in</h1>
      <p className="mb-8 text-sm leading-relaxed text-[var(--text-muted)]">
        Email and password access to your daily digest, board, and kanban.
      </p>

      {!legacy && (
        <>
          <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
            EMAIL
          </label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </div>
        </>
      )}

      <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
        {legacy ? "SITE PASSWORD" : "PASSWORD"}
      </label>
      <div className="relative mb-4">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
        <input
          type="password"
          autoFocus={legacy}
          autoComplete={legacy ? "current-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !password || (!legacy && !email)}
        className="group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-[#0d1117] transition disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {loading ? "Signing in…" : "Sign in"}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </button>

      <div className="mt-6 flex flex-col gap-2 text-center text-sm text-[var(--text-muted)]">
        <Link href="/register" className="text-[var(--accent)] hover:underline">
          Create an account
        </Link>
        <button
          type="button"
          onClick={() => setLegacy((v) => !v)}
          className="text-xs text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        >
          {legacy ? "Use email & password" : "Admin: site password login"}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <Suspense
        fallback={
          <div className="glass w-full max-w-md p-10 text-[var(--text-muted)]">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
