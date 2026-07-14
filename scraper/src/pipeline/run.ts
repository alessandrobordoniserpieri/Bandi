// scraper/src/pipeline/run.ts
import type { LLMProvider } from "../providers/types";
import type { GrantsDb, PageFetcher, PipelineResult, SourceConfig, StoredGrant } from "./types";
import { extractGrants } from "./extract-grants";
import { extractDetail } from "./extract-detail";
import { enrich } from "./enrich";
import { saveGrant } from "./save";
import { throttledLoop } from "./throttle";
import { sanitizeHtml } from "./sanitize-html";
import { UNLIMITED_BUDGET, type Budget } from "./budget";

const DETAIL_STALE_DAYS = 7;
// LLM-call spacing now lives in a single provider-level gate (see throttleProvider), which covers
// both listing chunks and detail calls. The detail loop therefore adds no throttle of its own.
const DETAIL_THROTTLE_MS = 0;
// Worst-case duration of one LLM call (per-call timeout × retries + throttle). The budget refuses
// to start a unit of work unless this much time remains, so a call can never straddle Vercel's
// hard 300s kill. Overridable per run (see run-production).
const DEFAULT_WORST_CASE_CALL_MS = 40_000;

export interface PipelineDeps {
  fetcher: PageFetcher;
  llm: LLMProvider;
  db: GrantsDb;
  detailThrottleMs?: number;
  sleep?: (ms: number) => Promise<void>;
  // Conservative wall-clock budget for the whole invocation. Defaults to unlimited (manual/tests).
  budget?: Budget;
  worstCaseCallMs?: number;
  // Called once when the budget cuts the run short, with the sources never reached. Defaults to a
  // console.warn so the truncation is visible in Vercel logs.
  onTruncated?: (skipped: SourceConfig[], total: number) => void;
}

const defaultOnTruncated = (skipped: SourceConfig[], total: number): void => {
  console.warn(
    `[runPipeline] budget esaurito: run troncato, saltate ${skipped.length}/${total} fonti: ` +
      skipped.map((s) => s.name).join(", "),
  );
};

export async function runPipeline(
  sources: SourceConfig[],
  deps: PipelineDeps,
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  const budget = deps.budget ?? UNLIMITED_BUDGET;
  const worstCaseCallMs = deps.worstCaseCallMs ?? DEFAULT_WORST_CASE_CALL_MS;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;

    // Conservative gate: never start a source unless there is time left for at least one
    // worst-case LLM call. The remaining sources are left for the next run (they keep their older
    // last_run_at, so they sort to the front) and the truncation is reported.
    if (!budget.hasTimeFor(worstCaseCallMs)) {
      const skipped = sources.slice(i);
      (deps.onTruncated ?? defaultOnTruncated)(skipped, sources.length);
      break;
    }

    const result: PipelineResult = {
      sourceId: source.id, inserted: 0, updated: 0, skipped: 0, errors: [], detailErrors: [],
    };
    const listingStart = Date.now();

    try {
      const pages = await deps.fetcher.fetchPages(source);
      for (const page of pages) {
        const cleaned = sanitizeHtml(page.html);
        if (deps.db.logDebugHtml) {
          await deps.db.logDebugHtml(source.id, page.url, page.html, cleaned).catch(() => {});
        }
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
    let detailEnriched = 0;
    let detailSkipped = 0;
    try {
      const needDetail = await deps.db.findGrantsNeedingDetail(source.id, DETAIL_STALE_DAYS);
      if (needDetail.length > 0) {
        const items = needDetail.map((g) => ({ id: g.id, label: g.title }));

        const { errors: detailErrs, stoppedShort } = await throttledLoop(
          items,
          async (item) => {
            const grant = needDetail.find((g) => g.id === item.id)!;
            const pages = await deps.fetcher.fetchPages({
              id: source.id, name: source.name, url: grant.url,
            });
            const page = pages[0];
            if (!page?.html) { detailSkipped++; return; }

            const detail = await extractDetail(page.html, deps.llm);
            if (!detail) { detailSkipped++; return; }

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
            detailEnriched++;
          },
          {
            delayMs: deps.detailThrottleMs ?? DETAIL_THROTTLE_MS,
            sleep: deps.sleep,
            // Stop enriching once the budget can no longer afford a worst-case call. The un-enriched
            // grants keep detail_fetched_at null and are picked up by the next run.
            shouldStop: () => !budget.hasTimeFor(worstCaseCallMs),
          },
        );

        // Grants left un-enriched by the budget count as skipped (they retry next run).
        detailSkipped += stoppedShort;
        result.detailErrors.push(...detailErrs);
      }
    } catch (err) {
      result.detailErrors.push(err instanceof Error ? err.message : String(err));
    }

    const detailDuration = Date.now() - detailStart;
    if (detailEnriched > 0 || detailSkipped > 0 || result.detailErrors.length > 0 || detailDuration > 100) {
      await deps.db.logScrapeRun({
        sourceId: source.id,
        phase: "detail",
        inserted: 0,
        updated: detailEnriched,
        skipped: detailSkipped,
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
