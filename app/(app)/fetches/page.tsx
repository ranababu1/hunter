import { getFetchesSnapshot } from "@/lib/jobs";
import { FetchesView } from "@/components/FetchesView";

export const dynamic = "force-dynamic";

export default async function FetchesPage() {
  const snapshot = await getFetchesSnapshot();

  if (!snapshot) {
    return (
      <div className="fade-up space-y-3">
        <div className="eyebrow">Coverage</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Fetch details</h1>
        <p className="text-sm text-[var(--text-muted)]">
          No fetch snapshot found. Add{" "}
          <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--accent)]">
            data/fetches.json
          </code>{" "}
          to populate this view.
        </p>
      </div>
    );
  }

  return <FetchesView snapshot={snapshot} />;
}
