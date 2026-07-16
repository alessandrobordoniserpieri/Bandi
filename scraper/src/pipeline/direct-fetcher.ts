// scraper/src/pipeline/direct-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";
import { ProviderError } from "../providers/types";
import { defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike } from "../providers/http";
import { withRetry, type RetryOptions } from "../providers/retry";

export interface DirectFetcherConfig {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
  // Clock seam for the {today} URL token; defaults to the real wall clock. Injected in tests.
  now?: () => Date;
}

// Plain HTTP fetcher for sources that are JSON APIs: no Chrome rendering, no Browserless
// quota, no external service in the path. The Accept header is PURE application/json —
// verified empirically that Plone's negotiation routes a compound value
// ("application/json, text/html;q=0.9") to the HTML traversal, which 404s on @search, while
// no header at all yields a 500. If a static-HTML source ever needs direct fetch, make the
// header configurable then. Selected per-source via scrape_config.fetchMode === "direct"
// (see CompositeFetcher).
export class DirectFetcher implements PageFetcher {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;
  private readonly now: () => Date;

  constructor(config: DirectFetcherConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry;
    this.now = config.now ?? (() => new Date());
  }

  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    // {today} → current ISO date, so a static listUrl in the DB can carry a dynamic server-side
    // date filter (e.g. Plone's scadenza_bando.range=min) without the date rotting.
    const today = this.now().toISOString().slice(0, 10);
    const url = (source.scrapeConfig?.listUrl ?? source.url).replace(/\{today\}/g, today);
    const body = await withRetry(
      async () => {
        let res;
        try {
          res = await this.fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (cause) {
          throw new ProviderError("direct: errore di rete o timeout", { retryable: true, cause });
        }
        if (res.status === 429 || res.status >= 500) {
          throw new ProviderError(`direct: HTTP ${res.status}`, { retryable: true });
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new ProviderError(`direct: HTTP ${res.status} ${detail}`.trim(), { retryable: false });
        }
        return res.text();
      },
      { retries: 2, ...this.retry }, // 1 retry (2 attempts total), same policy as Browserless
    );
    return [{ sourceId: source.id, url, html: body }];
  }
}
