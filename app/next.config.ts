import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
  // The scraper is a sibling workspace package shipping raw TypeScript; Next must transpile it
  // so the cron route handler can import runProductionScrape (App Router bundles the dependency).
  transpilePackages: ["bandi-scraper"],
  // The scraper lives outside app/; point the bundler root at the repo root so Turbopack can
  // resolve the `file:../scraper` symlink and trace its files.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
