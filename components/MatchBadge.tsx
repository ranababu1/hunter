import clsx from "clsx";
import type { MatchLevel } from "@/lib/types";

const styles: Record<MatchLevel, string> = {
  "Strong Match":
    "bg-[rgba(63,185,80,0.14)] text-[var(--strong)] border-[rgba(63,185,80,0.35)]",
  "Good Match":
    "bg-[rgba(210,153,34,0.14)] text-[var(--good)] border-[rgba(210,153,34,0.35)]",
  "Possible Match":
    "bg-[rgba(88,166,255,0.14)] text-[var(--possible)] border-[rgba(88,166,255,0.35)]",
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
