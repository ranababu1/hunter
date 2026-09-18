"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Crosshair } from "lucide-react";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password.");
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
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass w-full max-w-md p-8 sm:p-10"
    >
      <div className="mb-8 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid rgba(201,162,39,0.35)",
            boxShadow: "0 0 24px var(--accent-glow)",
          }}
        >
          <Crosshair className="h-5 w-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <div className="wordmark text-2xl">Hunter</div>
          <div className="eyebrow mt-1">Private job HQ</div>
        </div>
      </div>

      <h1 className="prose-title mb-2 text-3xl text-[var(--text)]">
        Enter the briefing room
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-[var(--text-muted)]">
        Password-gated access to your daily digest, consolidated board, and
        kanban pipeline.
      </p>

      <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
        SITE PASSWORD
      </label>
      <div className="relative mb-4">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]"
        />
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[rgba(0,0,0,0.35)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !password}
        className="group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-[#0a0b0f] transition disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #f5e6b8, var(--accent))",
        }}
      >
        {loading ? "Unlocking…" : "Unlock Hunter"}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </button>
    </motion.form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />
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
