"use client";

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import clsx from "clsx";

export type ToastTone = "success" | "info";

export function Toast({
  message,
  tone = "success",
  onDismiss,
  durationMs = 6000,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md sm:left-auto sm:right-5 sm:translate-x-0"
      style={{
        background: "var(--bg-elevated)",
        borderColor:
          tone === "success" ? "rgba(45,212,191,0.35)" : "var(--border-strong)",
      }}
    >
      <CheckCircle2
        className={clsx(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "success" ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
        )}
      />
      <p className="flex-1 text-sm text-[var(--text)]">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full p-0.5 text-[var(--text-dim)] hover:text-[var(--text)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
