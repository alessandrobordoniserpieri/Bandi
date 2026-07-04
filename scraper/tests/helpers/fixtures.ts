// scraper/tests/helpers/fixtures.ts
import type { PageFetcher, RawPage, SourceConfig } from "../../src/pipeline/types";

// Deterministic fetcher for tests: maps a source id → its pages, or throws
// for source ids listed in failIds (simulating a source-level fetch failure).
export class FixtureFetcher implements PageFetcher {
  constructor(
    private readonly pages: Record<string, RawPage[]>,
    private readonly failIds: Set<string> = new Set(),
  ) {}
  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    if (this.failIds.has(source.id)) throw new Error(`fetch failed for ${source.id}`);
    return this.pages[source.id] ?? [];
  }
}
