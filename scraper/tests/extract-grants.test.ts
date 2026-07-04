import { describe, it, expect } from "vitest";
import { extractGrants } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";

const page = (html: string): RawPage => ({ sourceId: "s1", url: "https://x/list", html });
function llmReturning(value: unknown, html = "H") {
  return new FakeLLMProvider(new Map<string, unknown>([[html, value]]));
}

describe("extractGrants", () => {
  it("drops tags outside the 47 and types outside the 62, keeps valid ones", async () => {
    const llm = llmReturning([{
      title: "Bando", url: "https://x/1",
      tags: ["sport", "inventato"], eligibleTypes: ["ONLUS", "TipoFinto"],
    }]);
    const [g] = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(g!.tags).toEqual(["sport"]);
    expect(g!.eligibleTypes).toEqual(["ONLUS"]);
  });

  it("nulls a non-ISO date and keeps a valid ISO date", async () => {
    const bad = llmReturning([{ title: "B", url: "https://x/1", deadline: "31 dicembre" }]);
    expect((await extractGrants(page("H"), { llm: bad, db: new InMemoryGrantsDb() }))[0]!.deadline).toBeNull();
    const good = llmReturning([{ title: "B", url: "https://x/2", deadline: "2026-12-31" }]);
    expect((await extractGrants(page("H"), { llm: good, db: new InMemoryGrantsDb() }))[0]!.deadline).toBe("2026-12-31");
  });

  it("skips items missing title or url", async () => {
    const llm = llmReturning([
      { url: "https://x/1" }, { title: "OK", url: "https://x/2" }, { title: "NoUrl" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(out.map((g) => g.url)).toEqual(["https://x/2"]);
  });

  it("resolves providerId via db lookup by name (or null)", async () => {
    const llm = llmReturning([
      { title: "A", url: "https://x/1", providerName: "Fondazione Test" },
      { title: "B", url: "https://x/2", providerName: "Sconosciuto" },
    ]);
    const db = new InMemoryGrantsDb({ "Fondazione Test": "prov-123" });
    const out = await extractGrants(page("H"), { llm, db });
    expect(out[0]!.providerId).toBe("prov-123");
    expect(out[1]!.providerId).toBeNull();
  });

  it("never throws on malformed AI output (non-array, invalid json-ish)", async () => {
    for (const value of [null, "not-json", 42, { nope: true }]) {
      const out = await extractGrants(page("H"), { llm: llmReturning(value), db: new InMemoryGrantsDb() });
      expect(out).toEqual([]);
    }
  });

  it("returns [] (not a throw) when the provider itself errors", async () => {
    const throwing = new FakeLLMProvider(new Map(), "throw");
    const out = await extractGrants(page("H"), { llm: throwing, db: new InMemoryGrantsDb() });
    expect(out).toEqual([]);
  });

  it("keeps the grant with providerId null (not a throw) when the db lookup errors", async () => {
    class ThrowingDb extends InMemoryGrantsDb {
      override async findProviderIdByName(): Promise<string | null> {
        throw new Error("db down");
      }
    }
    const llm = llmReturning([
      { title: "A", url: "https://x/1", providerName: "Fondazione Test" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new ThrowingDb() });
    expect(out).toHaveLength(1);
    expect(out[0]!.providerId).toBeNull();
  });
});
