import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Columns3,
  Compass,
  LayoutGrid,
  Newspaper,
  Radio,
  ShieldCheck,
  Timer,
  User,
} from "lucide-react";
import { getSessionUserId } from "@/lib/auth";
import { KANBAN_BOARD_COLUMNS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Hunter — Your job hunt, finally structured",
  description:
    "People lose months and money to unstructured job searching, and the right opportunities slip by. Hunter does the work: research, profiling, sorting and kanban-style application tracking.",
};

export const dynamic = "force-dynamic";

const problems = [
  {
    icon: Timer,
    title: "Hours vanish into tabs",
    body: "Dozens of careers portals, each checked by hand, each on its own schedule. Most of the time is spent looking, not applying.",
  },
  {
    icon: Compass,
    title: "The right roles get missed",
    body: "Without structure, a great posting on a portal you skipped last week is gone before you see it. Search is a discipline, not a mood.",
  },
  {
    icon: ShieldCheck,
    title: "Follow-ups fall through",
    body: "Spreadsheets go stale, emails get buried, and a promising conversation quietly dies because nobody tracked its state.",
  },
];

const steps = [
  {
    n: "01",
    title: "Profile",
    body: "Tell Hunter the roles you want, where, at what level, and paste your resume. That profile drives everything else.",
  },
  {
    n: "02",
    title: "Research",
    body: "Add the companies you care about. Hunter watches their careers portals so you do not have to remember to.",
  },
  {
    n: "03",
    title: "Sort",
    body: "Each morning a digest lands with new roles ranked against your profile: strong, good or possible matches.",
  },
  {
    n: "04",
    title: "Track",
    body: "Move every application through Identified, Applied, Responded and Interviewing to a clear outcome, kanban-style.",
  },
];

const features = [
  { icon: Newspaper, title: "Daily digest", body: "New roles from your companies, ranked against your profile, delivered every morning." },
  { icon: LayoutGrid, title: "Board", body: "Every role you have ever seen in one filterable board. Nothing gets lost." },
  { icon: Columns3, title: "Kanban tracking", body: "Application states you can drag, with honest end outcomes: selected, rejected, ignored, closed." },
  { icon: Building2, title: "Company watchlist", body: "Curate, import and validate the careers portals worth watching. Flag the broken ones." },
  { icon: Radio, title: "Fetch log", body: "See exactly which portals were checked, what was found and where a fetch hit a wall." },
  { icon: User, title: "Private profile", body: "Your resume, target roles and preferences live only in your workspace." },
];

export default async function HomePage() {
  const uid = await getSessionUserId();
  if (uid) redirect("/daily");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="fade-up py-20 sm:py-28">
        <div className="max-w-3xl">
          <div className="eyebrow mb-4">For serious job hunters</div>
          <h1 className="prose-title text-4xl leading-tight text-[var(--text)] sm:text-6xl">
            Your job hunt,{" "}
            <span style={{ color: "var(--accent)" }}>finally structured.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--text-muted)]">
            People spend months and real money searching for the right role.
            Because the search is unstructured, the best opportunities get
            missed. Hunter does the work: research, profiling, sorting and
            application tracking, with every state on a kanban board.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-medium text-[#0d1117] transition hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Start hunting free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] px-6 py-3 text-base text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-[var(--text-dim)]">
            Free for up to 5 companies. No card required. Your data is never
            shared.
          </p>
        </div>

        {/* Pipeline strip */}
        <div className="glass mt-14 overflow-x-auto p-4">
          <div className="flex min-w-[640px] items-center gap-2">
            {KANBAN_BOARD_COLUMNS.map((col, i) => (
              <div key={col.id} className="flex flex-1 items-center gap-2">
                <div
                  className={
                    i === KANBAN_BOARD_COLUMNS.length - 1
                      ? "flex-1 rounded-xl border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-4 py-3 text-center text-sm font-medium text-[var(--accent)]"
                      : "flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-center text-sm text-[var(--text)]"
                  }
                >
                  {col.label}
                </div>
                {i < KANBAN_BOARD_COLUMNS.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-dim)]" />
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-[var(--text-dim)]">
            Every application has a state. Every state is visible.
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">The problem</div>
          <h2 className="prose-title text-3xl text-[var(--text)]">
            Searching is unstructured. That is why good roles slip past.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {problems.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass p-6">
              <Icon className="h-5 w-5" style={{ color: "var(--accent)" }} />
              <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">How Hunter works</div>
          <h2 className="prose-title text-3xl text-[var(--text)]">
            Four disciplined steps, done for you every day.
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
              <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                {s.n}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">Inside the workspace</div>
          <h2 className="prose-title text-3xl text-[var(--text)]">
            Everything a hunt needs. Nothing it does not.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-[var(--border)] p-5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--accent-soft)", border: "1px solid rgba(45,212,191,0.35)" }}
              >
                <Icon className="h-4 w-4" style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text)]">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-16 sm:py-20">
        <div className="glass flex flex-col gap-8 p-8 md:flex-row md:items-center md:justify-between sm:p-10">
          <div className="max-w-xl">
            <div className="eyebrow mb-3">Pricing</div>
            <h2 className="prose-title text-3xl text-[var(--text)]">
              Start free. Grow the watchlist when you need to.
            </h2>
            <ul className="mt-5 space-y-2 text-sm text-[var(--text-muted)]">
              {[
                "Free: 5 companies, alternate-day fetches, 30 runs of history",
                "Paid tiers: 20, 45 or 100 companies with daily fetches",
                "Storage Plus for large resumes and long histories",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-6 py-3 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              See all plans
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-[#0d1117]"
              style={{ background: "var(--accent)" }}
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 text-center sm:py-24">
        <h2 className="prose-title text-3xl text-[var(--text)] sm:text-4xl">
          Stop searching. Start hunting.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--text-muted)]">
          Set up your roles and companies in a few minutes. Your first digest
          arrives with the next morning run.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-medium text-[#0d1117]"
            style={{ background: "var(--accent)" }}
          >
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] px-6 py-3 text-base text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
