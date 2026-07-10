// scraper/src/pipeline/run.ts
import type { LLMProvider } from "../providers/types";
import type { GrantsDb, PageFetcher, PipelineResult, SourceConfig, StoredGrant } from "./types";
import { extractGrants } from "./extract-grants";
import { extractDetail } from "./extract-detail";
import { enrich } from "./enrich";
import { saveGrant } from "./save";
import { throttledLoop } from "./throttle";

const DETAIL_STALE_DAYS = 7;
const DETAIL_THROTTLE_MS = 7_000;

export interface PipelineDeps {
  fetcher: PageFetcher;
  llm: LLMProvider;
  db: GrantsDb;
  detailThrottleMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function runPipeline(
  sources: SourceConfig[],
  deps: PipelineDeps,
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const source of sources) {
    const result: PipelineResult = {
      sourceId: source.id, inserted: 0, updated: 0, skipped: 0, errors: [], detailErrors: [],
    };
    const listingStart = Date.now();

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
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    const listingDuration = Date.now() - listingStart;
    await deps.db.logScrapeRun({
      sourceId: source.id,
      phase: "listing",
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      detailErrors: [],
      durationMs: listingDuration,
    });

    // Phase 2: detail enrichment
    const detailStart = Date.now();
    try {
      const needDetail = await deps.db.findGrantsNeedingDetail(source.id, DETAIL_STALE_DAYS);
      if (needDetail.length > 0) {
        const items = needDetail.map((g) => ({ id: g.id, label: g.title }));

        const { errors: detailErrs } = await throttledLoop(
          items,
          async (item) => {
            const grant = needDetail.find((g) => g.id === item.id)!;
            const pages = await deps.fetcher.fetchPages({
              id: source.id, name: source.name, url: grant.url,
            });
            const page = pages[0];
            if (!page?.html) return;

            const detail = await extractDetail(page.html, deps.llm);
            if (!detail) return;

            const patch: Partial<StoredGrant> = {};
            if (detail.summary) patch.summary = detail.summary;
            if (detail.requirements) patch.requirements = detail.requirements;
            if (detail.beneficiaries) patch.beneficiaries = detail.beneficiaries;
            if (detail.openingDate) patch.openingDate = detail.openingDate;
            if (detail.fundingType) patch.fundingType = detail.fundingType;
            if (detail.amount != null) patch.amount = detail.amount;
            if (detail.minAmount != null) patch.minAmount = detail.minAmount;
            if (detail.maxAmount != null) patch.maxAmount = detail.maxAmount;
            if (detail.cofundingPercentage != null) patch.cofundingPercentage = detail.cofundingPercentage;
            if (detail.eligibleExpenses) patch.eligibleExpenses = detail.eligibleExpenses;
            if (detail.applicationMethod) patch.applicationMethod = detail.applicationMethod;
            if (detail.contactInfo) patch.contactInfo = detail.contactInfo;
            if (detail.deadline) patch.deadline = detail.deadline;
            if (detail.eligibleTypes.length) patch.eligibleTypes = detail.eligibleTypes;
            if (detail.tags.length) patch.tags = detail.tags;

            await deps.db.markDetailFetched(grant.id, patch);
          },
          { delayMs: deps.detailThrottleMs ?? DETAIL_THROTTLE_MS, sleep: deps.sleep },
        );

        result.detailErrors.push(...detailErrs);
      }
    } catch (err) {
      result.detailErrors.push(err instanceof Error ? err.message : String(err));
    }

    const detailDuration = Date.now() - detailStart;
    if (result.detailErrors.length > 0 || detailDuration > 100) {
      await deps.db.logScrapeRun({
        sourceId: source.id,
        phase: "detail",
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        detailErrors: result.detailErrors,
        durationMs: detailDuration,
      });
    }

    await deps.db.updateSource(source.id, {
      lastRunAt: new Date().toISOString(),
      lastError: result.errors.length || result.detailErrors.length
        ? [...result.errors, ...result.detailErrors].join("; ")
        : null,
    });
    results.push(result);
  }
  return results;
}
