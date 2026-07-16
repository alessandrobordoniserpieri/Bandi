import { describe, it, expect } from "vitest";
import { DirectFetcher } from "../src/pipeline/direct-fetcher";
import { ProviderError } from "../src/providers/types";
import { mockFetch, mockResponse } from "./helpers/http";
import type { SourceConfig } from "../src/pipeline/types";

const source: SourceConfig = { id: "s1", name: "Fonte API", url: "https://esempio.it/pagina" };
const noWait = { retry: { sleep: async () => {} } };

describe("DirectFetcher", () => {
  it("GETs the url with a JSON-preferring Accept header, returning one RawPage", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, '{"items":[]}')]);
    const pages = await new DirectFetcher({ fetchImpl }).fetchPages(source);

    expect(requests[0]!.url).toBe("https://esempio.it/pagina");
    expect(requests[0]!.init.method).toBe("GET");
    expect(requests[0]!.init.headers.accept).toBe("application/json, text/html;q=0.9");
    expect(requests[0]!.init.body).toBeUndefined();
    expect(pages).toEqual([{ sourceId: "s1", url: "https://esempio.it/pagina", html: '{"items":[]}' }]);
  });

  it("prefers scrapeConfig.listUrl over the source url", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, "ok")]);
    const src: SourceConfig = { ...source, scrapeConfig: { listUrl: "https://esempio.it/@search?b_size=100" } };
    const pages = await new DirectFetcher({ fetchImpl }).fetchPages(src);
    expect(requests[0]!.url).toBe("https://esempio.it/@search?b_size=100");
    expect(pages[0]!.url).toBe("https://esempio.it/@search?b_size=100");
  });

  it("retries once on a 5xx then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(200, "ok")]);
    const pages = await new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source);
    expect(pages[0]!.html).toBe("ok");
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError after the retry is exhausted", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(503, {})]);
    await expect(new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source))
      .rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(2);
  });

  it("does not retry a 4xx", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(404, "not found"), mockResponse(200, "ok")]);
    await expect(new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source))
      .rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(1);
  });
});
