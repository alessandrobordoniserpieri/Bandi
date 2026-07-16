// scraper/src/pipeline/composite-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";

// Per-source dispatch between the Chrome-rendering fetcher (default) and the plain HTTP one.
// The mode lives in grant_sources.scrape_config.fetchMode ("direct"); absent or unknown values
// keep today's behavior, so existing sources are untouched. Reading the mode per-call (not at
// construction) means the same instance serves the whole multi-source run, including the
// detail phase, exactly like the single fetcher it replaces in PipelineDeps.
export class CompositeFetcher implements PageFetcher {
  constructor(
    private readonly browserless: PageFetcher,
    private readonly direct: PageFetcher,
  ) {}

  fetchPages(source: SourceConfig): Promise<RawPage[]> {
    const fetcher = source.scrapeConfig?.fetchMode === "direct" ? this.direct : this.browserless;
    return fetcher.fetchPages(source);
  }
}
