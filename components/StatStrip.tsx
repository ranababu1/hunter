"use client";

import type { Job } from "@/lib/types";

export function StatStrip({
  jobs,
  visitedCount,
}: {
  jobs: Job[];
  visitedCount: number;
}) {
  const strong = jobs.filter((j) => j.match === "Strong Match").length;
  const good = jobs.filter((j) => j.match === "Good Match").length;
  const neu = jobs.filter((j) => j.isNew).length;

  const items = [
    { label: "Roles", value: jobs.length },
    { label: "Strong", value: strong },
    { label: "Good", value: good },
    { label: "New", value: neu },
    { label: "Visited", value: visitedCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="glass flex flex-col gap-1 px-4 py-3"
          style={{ borderRadius: 12 }}
        >
          <span className="eyebrow">{item.label}</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
