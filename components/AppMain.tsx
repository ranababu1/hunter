"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed =
    pathname === "/kanban" ||
    pathname.startsWith("/kanban/") ||
    pathname === "/fetches" ||
    pathname.startsWith("/fetches/") ||
    pathname === "/companies" ||
    pathname.startsWith("/companies/") ||
    pathname === "/users" ||
    pathname.startsWith("/users/");

  return (
    <main
      className={clsx(
        "px-4 py-8 sm:px-6 sm:py-10",
        fullBleed ? "w-full max-w-none" : "mx-auto max-w-7xl",
      )}
    >
      {children}
    </main>
  );
}
