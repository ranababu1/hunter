import clsx from "clsx";
import type { MatchLevel } from "@/lib/types";

const styles: Record<MatchLevel, string> = {
  "Strong Match": "bg-[rgba(52,211,153,0.14)] text-[var(--strong)] border-[rgba(52,211,153,0.35)]",
  "Good Match": "bg-[rgba(251,191,36,0.14)] text-[var(--good)] border-[rgba(251,191,36,0.35)]",
  "Possible Match": "bg-[rgba(167,139,250,0.14)] text-[var(--possible)] border-[rgba(167,139,250,0.35)]",
};

export function MatchBadge({ match }: { match: MatchLevel }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        styles[match],
      )}
    >
      {match}
    </span>
  );
}
