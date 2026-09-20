"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(
          data.error ??
            `Could not send right now. Email us at ${fallbackEmail} instead.`,
        );
        setSending(false);
        return;
      }
      setDone(true);
    } catch {
      setError(`Network error. Email us at ${fallbackEmail} instead.`);
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="glass p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8" style={{ color: "var(--accent)" }} />
        <h2 className="mt-4 text-xl font-semibold text-[var(--text)]">Message received</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Thanks, {name.trim() || "friend"}. We read every message and reply
          within two working days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glass space-y-4 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="eyebrow">Name</span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="eyebrow">Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="eyebrow">Topic</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
          <option value="general">General question</option>
          <option value="pricing">Pricing and plans</option>
          <option value="support">Help with my workspace</option>
          <option value="feedback">Feedback or feature request</option>
          <option value="privacy">Privacy and data</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="eyebrow">Message</span>
        <textarea
          required
          rows={6}
          minLength={10}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you are trying to do and where it got stuck."
          className={inputClass + " resize-y"}
        />
        <span className="block text-right text-xs tabular-nums text-[var(--text-dim)]">
          {message.length} / 4000
        </span>
      </label>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--text-dim)]">
          Prefer email?{" "}
          <a href={`mailto:${fallbackEmail}`} className="text-[var(--accent)] hover:underline">
            {fallbackEmail}
          </a>
        </span>
        <button
          type="submit"
          disabled={sending || !name.trim() || !email.trim() || message.trim().length < 10}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-[#0d1117] transition disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
