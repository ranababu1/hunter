import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, Lock, Scale, Target } from "lucide-react";

export const metadata: Metadata = {
  title: "About Hunter",
  description:
    "Why Hunter exists: the job search is one of the most expensive, least structured projects people ever run. Hunter brings method to it.",
};

const principles = [
  {
    icon: Lock,
    title: "Your data stays yours",
    body: "Every account is a sealed workspace. Your companies, resume, digests and pipeline are never visible to anyone else, and never sold.",
  },
  {
    icon: Eye,
    title: "Honest signals",
    body: "When a portal returns nothing or a fetch fails, Hunter says so. We would rather show an empty feed than a padded one.",
  },
  {
    icon: Scale,
    title: "Structure over hustle",
    body: "A hunt is a project with states, owners and dates. Hunter treats it that way so your energy goes into conversations, not spreadsheets.",
  },
  {
    icon: Target,
    title: "Built for the serious",
    body: "Hunter is for people who want a specific role at specific companies, and are willing to run the search with discipline.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="fade-up max-w-2xl">
        <div className="eyebrow mb-4">About us</div>
        <h1 className="prose-title text-4xl leading-tight text-[var(--text)] sm:text-5xl">
          The job search is the most expensive project most people never plan.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[var(--text-muted)]">
          It costs months of evenings, real money, and a steady drain of
          confidence. And because almost everyone runs it as a loose collection
          of tabs, bookmarks and half-remembered follow-ups, the right
          opportunity is often the one that slipped past unseen.
        </p>
      </div>

      <section className="mt-16 grid gap-10 md:grid-cols-2">
        <div className="space-y-4 text-[var(--text-muted)]">
          <h2 className="prose-title text-2xl text-[var(--text)]">Why we built Hunter</h2>
          <p className="leading-relaxed">
            Hunter started as one job hunter&apos;s private headquarters: a
            morning digest, a board of every role seen, and a kanban of every
            application and where it stood. The discipline worked. Roles that
            would have been missed were found early, and nothing stalled for
            lack of a follow-up.
          </p>
          <p className="leading-relaxed">
            It turned out the problem was universal. So we turned that
            headquarters into a product anyone can run: you describe the roles
            you want and the companies you care about, and Hunter does the
            research, profiling, sorting and tracking every day.
          </p>
        </div>
        <div className="space-y-4 text-[var(--text-muted)]">
          <h2 className="prose-title text-2xl text-[var(--text)]">What Hunter is not</h2>
          <p className="leading-relaxed">
            Hunter is not a job board, and it does not blast your resume at
            recruiters. It does not promise a role. It gives you a structured,
            private system so that when the right opening appears, you see it
            first and act on it deliberately.
          </p>
          <p className="leading-relaxed">
            We keep the product narrow on purpose. Fewer features, done well,
            beat a dashboard nobody opens.
          </p>
        </div>
      </section>

      <section className="mt-20">
        <div className="eyebrow mb-3">Principles</div>
        <h2 className="prose-title text-3xl text-[var(--text)]">What we hold ourselves to</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {principles.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass p-6">
              <Icon className="h-5 w-5" style={{ color: "var(--accent)" }} />
              <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center sm:p-10">
        <h2 className="prose-title text-2xl text-[var(--text)]">Run your hunt like a project.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-[var(--text-muted)]">
          Set up your roles and companies in minutes. Free for up to five
          companies.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-[#0d1117]"
            style={{ background: "var(--accent)" }}
          >
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] px-5 py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Talk to us
          </Link>
        </div>
      </section>
    </div>
  );
}
