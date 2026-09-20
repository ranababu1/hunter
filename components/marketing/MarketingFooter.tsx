import Link from "next/link";
import { Crosshair } from "lucide-react";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <div className="flex items-center gap-2.5">
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
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            The structured way to hunt for your next role. Research, profiling,
            sorting and application tracking in one private workspace.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          <div className="space-y-2">
            <div className="eyebrow">Product</div>
            <Link href="/pricing" className="block text-[var(--text-muted)] hover:text-[var(--text)]">
              Pricing
            </Link>
            <Link href="/register" className="block text-[var(--text-muted)] hover:text-[var(--text)]">
              Start free
            </Link>
            <Link href="/login" className="block text-[var(--text-muted)] hover:text-[var(--text)]">
              Sign in
            </Link>
          </div>
          <div className="space-y-2">
            <div className="eyebrow">Company</div>
            <Link href="/about" className="block text-[var(--text-muted)] hover:text-[var(--text)]">
              About us
            </Link>
            <Link href="/contact" className="block text-[var(--text-muted)] hover:text-[var(--text)]">
              Contact
            </Link>
          </div>
          <div className="space-y-2">
            <div className="eyebrow">Principles</div>
            <p className="text-[var(--text-muted)]">Your data stays yours.</p>
            <p className="text-[var(--text-muted)]">No spam, ever.</p>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-[var(--text-dim)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {year} Hunter. Built for serious job hunters.</span>
          <span>Every account is isolated. We never share or sell your data.</span>
        </div>
      </div>
    </footer>
  );
}
