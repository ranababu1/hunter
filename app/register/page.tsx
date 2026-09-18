"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, User, Phone, ArrowRight, Crosshair } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-16">
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
            <div className="eyebrow mt-1">Create account</div>
          </div>
        </div>

        <h1 className="prose-title mb-2 text-2xl text-[var(--text)]">
          Register
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-[var(--text-muted)]">
          Free plan: 5 companies · 2 MB · alternate-day fetches. Upgrade anytime from Billing.
        </p>

        <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
          NAME (OPTIONAL)
        </label>
        <div className="relative mb-4">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>

        <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
          EMAIL
        </label>
        <div className="relative mb-4">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>


        <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
          PHONE (OPTIONAL)
        </label>
        <div className="relative mb-4">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 …"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] py-3 pl-10 pr-4 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>

        <label className="mb-2 block text-xs font-medium tracking-wide text-[var(--text-dim)]">
          PASSWORD
        </label>
        <div className="relative mb-4">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
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
          disabled={loading || !email || password.length < 8}
          className="group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-[#0d1117] transition disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Creating…" : "Create account"}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
