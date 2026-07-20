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
  // pdf.js (via unpdf) renders through @napi-rs/canvas, a native prebuilt addon. Native modules
  // must NOT be bundled: Next has to resolve them at runtime from node_modules and trace the
  // `.node` binary into the deployment. Listing them here does exactly that. `unpdf` is also
  // externalized so its bundled pdf.js worker isn't mangled by the bundler.
  serverExternalPackages: ["@napi-rs/canvas", "unpdf"],
};

export default nextConfig;
