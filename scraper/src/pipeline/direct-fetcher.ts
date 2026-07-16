// scraper/src/pipeline/direct-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";
import { ProviderError } from "../providers/types";
import { defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike } from "../providers/http";
import { withRetry, type RetryOptions } from "../providers/retry";

export interface DirectFetcherConfig {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
}

// Plain HTTP fetcher for sources that are JSON APIs or static pages: no Chrome rendering, no
// Browserless quota, no external service in the path. The Accept header prefers JSON (Plone's
// @search answers 500 without it) while still accepting HTML for static pages. Selected
// per-source via scrape_config.fetchMode === "direct" (see CompositeFetcher).
export class DirectFetcher implements PageFetcher {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;

  constructor(config: DirectFetcherConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry;
  }

  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    const url = source.scrapeConfig?.listUrl ?? source.url;
    const body = await withRetry(
      async () => {
        let res;
        try {
          res = await this.fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json, text/html;q=0.9" },
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
