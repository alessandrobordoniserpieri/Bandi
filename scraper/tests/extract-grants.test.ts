import { describe, it, expect } from "vitest";
import { extractGrants, GRANT_JSON_SCHEMA } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";

// Gemini's response_schema (a restricted OpenAPI-3.0 subset) rejects `type` as an array —
// {"type": ["string", "null"]} fails every single extraction call with HTTP 400 ("Proto field
// is not repeating, cannot start list"), which extractGrants' catch-and-return-[] swallows
// silently — indistinguishable from "this page genuinely has no grants". Confirmed live against
// the real Gemini API: 0/12 production sources ever extracted a grant until this was fixed.
// This is a structural guard against reintroducing that shape; it can't replace a real API call,
// but it's free and would have caught the original bug.
function walkSchemaTypes(node: unknown, path: string, onType: (path: string, type: unknown) => void): void {
  if (typeof node !== "object" || node === null) return;
  const obj = node as Record<string, unknown>;
  if ("type" in obj) onType(path, obj.type);
  if (obj.items) walkSchemaTypes(obj.items, `${path}.items`, onType);
  if (obj.properties && typeof obj.properties === "object") {
    for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
      walkSchemaTypes(value, `${path}.properties.${key}`, onType);
    }
  }
}

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

  it("drops items with a malformed url (bare domain, relative path, spaced string), keeps a valid one", async () => {
    const llm = llmReturning([
      { title: "Bare domain", url: "esempio.it/bando" },
      { title: "Relative path", url: "/bandi/1" },
      { title: "Not a url", url: "not a url" },
      { title: "Valid", url: "https://esempio.it/bando/1" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(out.map((g) => g.title)).toEqual(["Valid"]);
  });

  it("parses a string amount (Italian format) into a number; keeps a junk string amount as null", async () => {
    const llm = llmReturning([
      { title: "A", url: "https://x/1", amount: "€ 50.000,00", cofundingRequired: "€ 1.000,50" },
      { title: "B", url: "https://x/2", amount: "not-a-number" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(out[0]!.amount).toBe(50000);
    expect(out[0]!.cofundingRequired).toBe(1000.5);
    expect(out[1]!.amount).toBeNull();
  });

  it("GRANT_JSON_SCHEMA never declares `type` as an array (Gemini's response_schema rejects it)", () => {
    const offenders: string[] = [];
    walkSchemaTypes(GRANT_JSON_SCHEMA, "$", (path, type) => {
      if (Array.isArray(type)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });
});
