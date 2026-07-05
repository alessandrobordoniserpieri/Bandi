import { describe, it, expect } from "vitest";
import { BrowserlessFetcher } from "../src/pipeline/browserless-fetcher";
import { ProviderError } from "../src/providers/types";
import { bodyOf, mockFetch, mockResponse } from "./helpers/http";
import type { SourceConfig } from "../src/pipeline/types";

const source: SourceConfig = { id: "s1", name: "Fonte", url: "https://esempio.it/bandi" };
const noWait = { retry: { sleep: async () => {} } };

describe("BrowserlessFetcher", () => {
  it("POSTs to /content with the token and the source url, returning one RawPage", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, "<html>bandi</html>")]);
    const pages = await new BrowserlessFetcher({ apiKey: "tok", fetchImpl }).fetchPages(source);

    expect(requests[0]!.url).toBe("https://chrome.browserless.io/content?token=tok");
    expect(bodyOf(requests[0]!).url).toBe("https://esempio.it/bandi");
    expect(pages).toEqual([{ sourceId: "s1", url: "https://esempio.it/bandi", html: "<html>bandi</html>" }]);
  });

  it("uses scrapeConfig.listUrl and forwards waitFor as waitForSelector", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, "<html>x</html>")]);
    const src: SourceConfig = { ...source, scrapeConfig: { listUrl: "https://esempio.it/lista", waitFor: ".card" } };
    const pages = await new BrowserlessFetcher({ apiKey: "tok", fetchImpl }).fetchPages(src);

    const body = bodyOf(requests[0]!);
    expect(body.url).toBe("https://esempio.it/lista");
    expect(body.waitForSelector).toEqual({ selector: ".card" });
    expect(pages[0]!.url).toBe("https://esempio.it/lista");
  });

  it("honors a custom baseUrl (trailing slash trimmed)", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, "<html>x</html>")]);
    await new BrowserlessFetcher({ apiKey: "tok", baseUrl: "https://eu.browserless.io/", fetchImpl }).fetchPages(source);
    expect(requests[0]!.url).toBe("https://eu.browserless.io/content?token=tok");
  });

  it("retries once on a 5xx then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(200, "<html>ok</html>")]);
    const pages = await new BrowserlessFetcher({ apiKey: "tok", fetchImpl, ...noWait }).fetchPages(source);
    expect(pages[0]!.html).toBe("<html>ok</html>");
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError after the retry is exhausted", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(503, {})]);
    await expect(
      new BrowserlessFetcher({ apiKey: "tok", fetchImpl, ...noWait }).fetchPages(source),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(2);
  });

  it("does not retry a 4xx", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(403, "forbidden"), mockResponse(200, "<html>x</html>")]);
    await expect(
      new BrowserlessFetcher({ apiKey: "tok", fetchImpl, ...noWait }).fetchPages(source),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(1);
  });
});
