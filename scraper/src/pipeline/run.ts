// scraper/src/pipeline/run.ts
import type { LLMProvider } from "../providers/types";
import type { GrantsDb, PageFetcher, PipelineResult, SourceConfig } from "./types";
import { extractGrants } from "./extract-grants";
import { enrich } from "./enrich";
import { saveGrant } from "./save";

export async function runPipeline(
  sources: SourceConfig[],
  deps: { fetcher: PageFetcher; llm: LLMProvider; db: GrantsDb },
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const source of sources) {
    const result: PipelineResult = {
      sourceId: source.id, inserted: 0, updated: 0, skipped: 0, errors: [],
    };
    try {
      const pages = await deps.fetcher.fetchPages(source);
      for (const page of pages) {
        const grants = await extractGrants(page, { llm: deps.llm, db: deps.db });
        for (const raw of grants) {
          const outcome = await saveGrant(enrich(raw), deps.db);
          result[outcome] += 1;
        }
      }
    } catch (err) {
      // Source isolation: a thrown error (e.g. fetch failure) is recorded for
      // this source only; the loop continues with the remaining sources.
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
    await deps.db.updateSource(source.id, {
      lastRunAt: new Date().toISOString(),
      lastError: result.errors.length ? result.errors.join("; ") : null,
    });
    results.push(result);
  }
  return results;
}
