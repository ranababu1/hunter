import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Hunter job HQ */
  // pdf-parse (resume upload extraction, lib/resume-extract.ts) ships a
  // pdf.js worker file that Next's bundler otherwise relocates/transforms,
  // breaking its own relative worker lookup at runtime ("Setting up fake
  // worker failed"). Marking it external keeps it — and the worker file —
  // as plain node_modules files that Vercel's function tracer picks up.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
