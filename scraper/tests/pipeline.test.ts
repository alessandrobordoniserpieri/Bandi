import { describe, it, expect } from "vitest";
import { runPipeline } from "../src/pipeline/run";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import { FixtureFetcher } from "./helpers/fixtures";
import type { RawPage, SourceConfig } from "../src/pipeline/types";
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
