import { describe, it, expect } from "vitest";
import { CompositeFetcher } from "../src/pipeline/composite-fetcher";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";

class TaggedFetcher implements PageFetcher {
  calls: SourceConfig[] = [];
  constructor(private readonly tag: string) {}
  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    this.calls.push(source);
    return [{ sourceId: source.id, url: source.url, html: this.tag }];
  }
}

const src = (fetchMode?: string): SourceConfig => ({
  id: "s1", name: "Fonte", url: "https://x/list",
  ...(fetchMode ? { scrapeConfig: { fetchMode } } : {}),
});

describe("CompositeFetcher", () => {
  it("routes fetchMode 'direct' to the direct fetcher", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src("direct"));
    expect(pages[0]!.html).toBe("direct");
    expect(browserless.calls).toHaveLength(0);
  });

  it("defaults to browserless when fetchMode is absent", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src());
    expect(pages[0]!.html).toBe("browserless");
    expect(direct.calls).toHaveLength(0);
  });

  it("defaults to browserless on an unknown fetchMode value", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src("typo"));
    expect(pages[0]!.html).toBe("browserless");
  });
});
