import { describe, it, expect } from "vitest";
import { runPipeline } from "../src/pipeline/run";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import { FixtureFetcher } from "./helpers/fixtures";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";
import type { Budget } from "../src/pipeline/budget";
import { createBudget } from "../src/pipeline/budget";

const sources: SourceConfig[] = [
  { id: "s1", name: "Fonte 1", url: "https://a/list" },
  { id: "s2", name: "Fonte 2", url: "https://b/list" },
];
const pageS1: RawPage = { sourceId: "s1", url: "https://a/list", html: "HTML_S1" };
const pageS2: RawPage = { sourceId: "s2", url: "https://b/list", html: "HTML_S2" };

const noSleep = async () => {};

function makeDeps(failIds = new Set<string>()) {
  const llm = new FakeLLMProvider(new Map<string, unknown>([
    ["HTML_S1", [
      { title: "Bando A", url: "https://a/bando-1", tags: ["sport"] },
      { title: "Bando B", url: "https://a/bando-2", amount: 50000 },
    ]],
    ["HTML_S2", [{ title: "Bando C", url: "https://b/bando-1" }]],
  ]));
  const fetcher = new FixtureFetcher({ s1: [pageS1], s2: [pageS2] }, failIds);
  const db = new InMemoryGrantsDb();
  return { llm, fetcher, db, detailThrottleMs: 0, sleep: noSleep };
}

describe("runPipeline", () => {
  it("extracts, enriches, and inserts grants per source", async () => {
    const deps = makeDeps();
    const [r1, r2] = await runPipeline(sources, deps);
    expect(r1).toMatchObject({ sourceId: "s1", inserted: 2, updated: 0, skipped: 0, errors: [], detailErrors: [] });
    expect(r2).toMatchObject({ sourceId: "s2", inserted: 1, errors: [], detailErrors: [] });
    expect(deps.db.grants.length).toBe(3);
    expect(deps.db.sources["s1"]!.lastError).toBeNull();
  });

  it("is idempotent: a second identical run inserts nothing and skips all", async () => {
    const deps = makeDeps();
    await runPipeline(sources, deps);
    const second = await runPipeline(sources, deps);
    expect(second[0]).toMatchObject({ inserted: 0, skipped: 2 });
    expect(second[1]).toMatchObject({ inserted: 0, skipped: 1 });
    expect(deps.db.grants.length).toBe(3);
  });

  it("isolates a failing source: its error is recorded, others still complete", async () => {
    const deps = makeDeps(new Set(["s1"]));
    const [r1, r2] = await runPipeline(sources, deps);
    expect(r1!.errors.length).toBe(1);
    expect(r1!.inserted).toBe(0);
    expect(r2).toMatchObject({ sourceId: "s2", inserted: 1, errors: [] });
    expect(deps.db.sources["s1"]!.lastError).toContain("fetch failed");
  });

  it("updates only changed fields on a changed rerun", async () => {
    const deps = makeDeps();
    await runPipeline(sources, deps);
    // change Bando B's amount on the next run
    const llm2 = new FakeLLMProvider(new Map<string, unknown>([
      ["HTML_S1", [
        { title: "Bando A", url: "https://a/bando-1", tags: ["sport"] },
        { title: "Bando B", url: "https://a/bando-2", amount: 99999 },
      ]],
      ["HTML_S2", [{ title: "Bando C", url: "https://b/bando-1" }]],
    ]));
    const [r1] = await runPipeline(sources, { ...deps, llm: llm2 });
    expect(r1).toMatchObject({ updated: 1, skipped: 1 });
  });

  it("forwards scrapeConfig (minus listUrl) to the detail-phase fetch", async () => {
    // listUrl points at the LISTING endpoint: if it leaked into the detail-phase SourceConfig,
    // url-resolution inside the fetchers (scrapeConfig.listUrl ?? url) would re-fetch the
    // listing instead of the grant page. fetchMode instead MUST survive, or per-source
    // dispatch silently falls back to Browserless in the detail phase.
    const calls: SourceConfig[] = [];
    let n = 0;
    const recording: PageFetcher = {
      async fetchPages(s: SourceConfig): Promise<RawPage[]> {
        calls.push(s);
        n++;
        return [{ sourceId: s.id, url: s.scrapeConfig?.listUrl ?? s.url, html: n === 1 ? "HTML_S1" : "DETAIL" }];
      },
    };
    const src: SourceConfig = {
      id: "s1", name: "Fonte 1", url: "https://a/list",
      scrapeConfig: { fetchMode: "direct", listUrl: "https://a/api", maxPages: 1 },
    };
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      ["HTML_S1", [{ title: "Bando A", url: "https://a/bando-1" }]],
    ]));
    await runPipeline([src], { llm, fetcher: recording, db: new InMemoryGrantsDb(), detailThrottleMs: 0, sleep: noSleep });

    const detailCall = calls.find((c) => c.url === "https://a/bando-1");
    expect(detailCall).toBeDefined();
    expect(detailCall!.scrapeConfig?.fetchMode).toBe("direct");
    expect(detailCall!.scrapeConfig?.listUrl).toBeUndefined();
  });

  it("skips all sources and reports truncation when the budget is already exhausted", async () => {
    const deps = makeDeps();
    const exhausted: Budget = { hasTimeFor: () => false, remainingMs: () => 0 };
    const truncated: { skipped: SourceConfig[]; total: number }[] = [];
    const results = await runPipeline(sources, {
      ...deps,
      budget: exhausted,
      onTruncated: (skipped, total) => truncated.push({ skipped, total }),
    });
    expect(results).toEqual([]);              // nothing processed
    expect(deps.db.grants.length).toBe(0);
    expect(truncated).toHaveLength(1);
    expect(truncated[0]!.skipped.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(truncated[0]!.total).toBe(2);
  });

  // docs/superpowers/specs/2026-07-20-source-id-detail-priority-attribution.md — end-to-end proof
  // that runPipeline builds the detailEnabledBySource map from `sources` (both known, capabilities
  // differ = Tier 1) and threads it through saveGrant/resolveSourceId. Uses sportesalute's real
  // deterministic card parser (archetypes.test.ts's fixture shape) — no LLM matching involved.
  it("reattributes source_id to a detailEnabled source when a non-detailEnabled aggregator scraped it first", async () => {
    const aggregator: SourceConfig = { id: "agg", name: "Aggregatore", url: "https://agg/list", scrapeConfig: { archetype: "sportesalute" } };
    const direct: SourceConfig = { id: "direct", name: "Fonte diretta", url: "https://direct/list" };
    const sesCard = `<div class="sppb-addon-image-layouts" data-date="01/09/2026">
       <h5 class="title_card">Bando condiviso</h5>
       <span class="label regione-bando">Lazio</span>
       <p><strong>Termine di presentazione domanda:</strong> 01/09/2026<br>
          <strong>Destinatari:</strong> Enti del terzo settore</p>
       <p><a href="https://shared/bando-1" class="button fit">Scopri di più</a></p>
     </div>`;
    const aggPage: RawPage = {
      sourceId: "agg", url: "https://agg/list",
      html: `<html><body><main><div class="listabandi cards">${sesCard}</div></main></body></html>`,
    };
    const directPage: RawPage = { sourceId: "direct", url: "https://direct/list", html: "HTML_DIRECT" };
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      ["HTML_DIRECT", [{ title: "Bando condiviso", url: "https://shared/bando-1" }]],
    ]));
    const fetcher = new FixtureFetcher({ agg: [aggPage], direct: [directPage] });
    const db = new InMemoryGrantsDb();

    // One run, both sources known: aggregator (index 0, detailEnabled: false) is processed first
    // and inserts the grant via its code parser; direct (index 1, detailEnabled: true) sees the
    // same URL next.
    const [aggResult, directResult] = await runPipeline([aggregator, direct], { llm, fetcher, db, detailThrottleMs: 0, sleep: noSleep });

    // Prove this is a genuine reattribution (agg inserted, direct then updated the SAME row),
    // not two independent inserts that would trivially leave sourceId at whichever ran last.
    expect(aggResult).toMatchObject({ inserted: 1, updated: 0 });
    expect(directResult).toMatchObject({ inserted: 0, updated: 1 });
    expect(db.grants).toHaveLength(1); // deduped by URL, not two rows
    expect(db.grants[0]!.sourceId).toBe("direct");
  });

  it("processes sources until the budget runs out, then truncates the rest", async () => {
    const deps = makeDeps();
    // A clock that advances 200s per read. First source's gate check passes (t=0 < deadline 250s),
    // subsequent checks push past the 250s deadline, so the second source is skipped.
    let reads = 0;
    const now = () => (reads++) * 200_000;
    const truncated: SourceConfig[][] = [];
    const results = await runPipeline(sources, {
      ...deps,
      budget: createBudget(250_000, now),
      worstCaseCallMs: 40_000,
      onTruncated: (skipped) => truncated.push(skipped),
    });
    expect(results.map((r) => r.sourceId)).toEqual(["s1"]); // only the first ran
    expect(truncated[0]!.map((s) => s.id)).toEqual(["s2"]);
  });
});
