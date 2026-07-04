import { describe, it, expect } from "vitest";
import { runPipeline } from "../src/pipeline/run";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import { FixtureFetcher } from "./helpers/fixtures";
import type { RawPage, SourceConfig } from "../src/pipeline/types";

const sources: SourceConfig[] = [
  { id: "s1", name: "Fonte 1", url: "https://a/list" },
  { id: "s2", name: "Fonte 2", url: "https://b/list" },
];
const pageS1: RawPage = { sourceId: "s1", url: "https://a/list", html: "HTML_S1" };
const pageS2: RawPage = { sourceId: "s2", url: "https://b/list", html: "HTML_S2" };

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
  return { llm, fetcher, db };
}

describe("runPipeline", () => {
  it("extracts, enriches, and inserts grants per source", async () => {
    const deps = makeDeps();
    const [r1, r2] = await runPipeline(sources, deps);
    expect(r1).toMatchObject({ sourceId: "s1", inserted: 2, updated: 0, skipped: 0, errors: [] });
    expect(r2).toMatchObject({ sourceId: "s2", inserted: 1, errors: [] });
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
});
