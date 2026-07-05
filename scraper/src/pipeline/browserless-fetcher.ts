// scraper/src/pipeline/browserless-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";
import { ProviderError } from "../providers/types";
import { defaultFetch, type FetchLike } from "../providers/http";
import { withRetry, type RetryOptions } from "../providers/retry";

const DEFAULT_BASE_URL = "https://chrome.browserless.io";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BrowserlessConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
}

// Renders a page with Browserless.io /content and returns its HTML. The LLM extract stage
// then pulls the grants array out of that HTML, so one RawPage per source (the listing page)
// is enough for the MVP; pagination via scrapeConfig.maxPages is deferred.
export class BrowserlessFetcher implements PageFetcher {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;

  constructor(config: BrowserlessConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry;
  }

  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    const listUrl = source.scrapeConfig?.listUrl ?? source.url;
    const html = await this.fetchContent(listUrl, source.scrapeConfig?.waitFor);
    return [{ sourceId: source.id, url: listUrl, html }];
  }

  private async fetchContent(url: string, waitFor?: string): Promise<string> {
    const endpoint = `${this.baseUrl}/content?token=${encodeURIComponent(this.apiKey)}`;
    // gotoOptions.waitUntil networkidle2 lets JS-rendered listings settle; waitFor (a CSS
    // selector) is forwarded when a source needs a specific element before capture.
    const body: Record<string, unknown> = { url, gotoOptions: { waitUntil: "networkidle2" } };
    if (waitFor) body.waitForSelector = { selector: waitFor };

    return withRetry(
      async () => {
        let res;
        try {
          res = await this.fetchImpl(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (cause) {
          throw new ProviderError("browserless: errore di rete o timeout", { retryable: true, cause });
        }
        if (res.status === 429 || res.status >= 500) {
          throw new ProviderError(`browserless: HTTP ${res.status}`, { retryable: true });
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new ProviderError(`browserless: HTTP ${res.status} ${detail}`.trim(), { retryable: false });
        }
        return res.text();
      },
      { retries: 2, ...this.retry }, // 1 retry (2 attempts total)
    );
  }
}
