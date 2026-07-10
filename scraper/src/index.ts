// scraper/src/index.ts — public API consumed by the app (cron route, AI features) and the CLI.
export { runProductionScrape, parseScrapeArgs } from "./run-production";
export type { ScrapeOptions } from "./run-production";
export { runPipeline } from "./pipeline/run";
export type {
  PipelineResult,
  SourceConfig,
  ScrapeConfig,
  ExtractedGrant,
  StoredGrant,
  DetailGrant,
  ScrapeLogEntry,
  RawPage,
  GrantsDb,
  PageFetcher,
} from "./pipeline/types";

// Building blocks reused by the app's on-demand AI features (011): the provider seam,
// single-page fetching, extraction, and URL normalization for dedup.
export { getProvider } from "./providers";
export { ProviderError } from "./providers/types";
export type { LLMProvider, JsonSchema } from "./providers/types";
export { FakeLLMProvider } from "./providers/fake";
export { BrowserlessFetcher } from "./pipeline/browserless-fetcher";
export { SupabaseGrantsDb } from "./db/supabase-grants-db";
export { extractGrants } from "./pipeline/extract-grants";
export { extractDetail } from "./pipeline/extract-detail";
export { enrich } from "./pipeline/enrich";
export { normalizeUrl } from "./pipeline/dedup";
export { throttledLoop } from "./pipeline/throttle";
export type { FundingType } from "./pipeline/vocab";
