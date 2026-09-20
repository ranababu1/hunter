import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MessageSquare } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact Hunter",
  description:
    "Questions about plans, help with your workspace, or feedback on Hunter. We read every message and reply within two working days.",
};

export default function ContactPage() {
  const email = contactEmail();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="fade-up max-w-2xl">
        <div className="eyebrow mb-4">Contact us</div>
        <h1 className="prose-title text-4xl leading-tight text-[var(--text)] sm:text-5xl">
          Talk to the people who build Hunter.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--text-muted)]">
          Questions about plans, a portal that will not fetch, an idea that
          would make your hunt easier. Send it over.
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_320px]">
        <ContactForm fallbackEmail={email} />

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <Mail className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <h2 className="mt-3 font-semibold text-[var(--text)]">Email</h2>
            <a href={`mailto:${email}`} className="mt-1 block break-all text-sm text-[var(--accent)] hover:underline">
              {email}
            </a>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <h2 className="mt-3 font-semibold text-[var(--text)]">Response time</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Within two working days. Workspace issues from paying members go
              first.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <MessageSquare className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <h2 className="mt-3 font-semibold text-[var(--text)]">Before you write</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
              <li>
                <Link href="/pricing" className="hover:text-[var(--text)]">
                  Plans and limits →
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[var(--text)]">
                  How Hunter treats your data →
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-[var(--text)]">
                  Create a free workspace →
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
