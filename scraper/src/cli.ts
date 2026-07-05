// scraper/src/cli.ts
// Manual/debug entrypoint: `npm run scrape [--source=<name|id>] [--dry-run]`.
import { parseScrapeArgs, runProductionScrape } from "./run-production";

async function main(): Promise<void> {
  const options = parseScrapeArgs(process.argv.slice(2));
  const results = await runProductionScrape(process.env, options);
  for (const r of results) {
    const errs = r.errors.length ? ` errors: ${r.errors.join("; ")}` : "";
    console.log(`${r.sourceId}: +${r.inserted} ~${r.updated} =${r.skipped}${errs}`);
  }
  process.exitCode = results.some((r) => r.errors.length) ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
