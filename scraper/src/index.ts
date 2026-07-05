// scraper/src/index.ts — public API consumed by the app (cron route) and the CLI.
export { runProductionScrape, parseScrapeArgs } from "./run-production";
export type { ScrapeOptions } from "./run-production";
export { runPipeline } from "./pipeline/run";
export type {
  PipelineResult,
  SourceConfig,
  ScrapeConfig,
  ExtractedGrant,
  StoredGrant,
} from "./pipeline/types";
