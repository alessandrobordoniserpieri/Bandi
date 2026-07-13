import { describe, it, expect } from "vitest";
import { extractGrants, GRANT_JSON_SCHEMA } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";
import type { LLMProvider } from "../src/providers/types";

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

  it("resolves relative URLs against the page URL, drops truly invalid ones", async () => {
    const llm = llmReturning([
      { title: "Relative path", url: "/bandi/1" },
      { title: "Valid", url: "https://esempio.it/bando/1" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(out.map((g) => g.title)).toEqual(["Relative path", "Valid"]);
    expect(out[0]!.url).toBe("https://x/bandi/1");
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

  it("snaps a hallucinated URL back to the closest href in the page", async () => {
    const html = '<p><a href="https://example.it/bando-per-inclusione-attiva">Bando</a></p>';
    const sanitized = '<p><a href="https://example.it/bando-per-inclusione-attiva">Bando</a></p>';
    const hallucinated = "https://example.it/bando-for-inclusione-attiva";
    const llm = llmReturning([{ title: "Bando", url: hallucinated }], sanitized);
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://example.it/bando-per-inclusione-attiva");
  });

  it("keeps the extracted URL when no hrefs exist in the page", async () => {
    const html = "<p>No links here</p>";
    const sanitized = "<p>No links here</p>";
    const llm = llmReturning([{ title: "B", url: "https://other.it/bando" }], sanitized);
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://other.it/bando");
  });

  it("snaps to the closest same-domain href even with 1 char difference", async () => {
    const html = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const sanitized = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const llm = llmReturning([{ title: "B", url: "https://example.it/bando-for-x" }], sanitized);
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://example.it/bando-per-x");
  });

  it("does not snap to an href on a different domain", async () => {
    const html = '<p><a href="https://different.it/bando-per-x">Bando</a></p>';
    const sanitized = '<p><a href="https://different.it/bando-per-x">Bando</a></p>';
    const llm = llmReturning([{ title: "B", url: "https://example.it/bando-per-x" }], sanitized);
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://example.it/bando-per-x");
  });

  it("GRANT_JSON_SCHEMA never declares `type` as an array (Gemini's response_schema rejects it)", () => {
    const offenders: string[] = [];
    walkSchemaTypes(GRANT_JSON_SCHEMA, "$", (path, type) => {
      if (Array.isArray(type)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it("extracts grants from large HTML by chunking with overlap", async () => {
    const bigHtml = "a".repeat(50_000);
    const calls: string[] = [];
    const llm: LLMProvider = {
      async extract({ html }) {
        calls.push(`len=${html.length}`);
        return [{ title: `Bando ${calls.length}`, url: `https://x/${calls.length}` }];
      },
    };
    const out = await extractGrants(
      { sourceId: "s1", url: "https://x/list", html: bigHtml },
      { llm, db: new InMemoryGrantsDb() },
    );
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(out).toHaveLength(calls.length);
  });

  it("deduplicates grants with the same URL across overlapping chunks", async () => {
    const bigHtml = "a".repeat(50_000);
    const duplicate = { title: "Same Bando", url: "https://x/same" };
    const llm: LLMProvider = {
      async extract() { return [duplicate]; },
    };
    const out = await extractGrants(
      { sourceId: "s1", url: "https://x/list", html: bigHtml },
      { llm, db: new InMemoryGrantsDb() },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://x/same");
  });

  it("merges duplicate grants across chunks, filling null fields from later occurrences", async () => {
    const bigHtml = "a".repeat(50_000);
    let call = 0;
    const llm: LLMProvider = {
      async extract() {
        call++;
        return call === 1
          ? [{ title: "Bando X", url: "https://x/bando" }]
          : [{ title: "Bando X", url: "https://x/bando", amount: "€ 50.000,00", deadline: "2026-12-31" }];
      },
    };
    const out = await extractGrants(
      { sourceId: "s1", url: "https://x/list", html: bigHtml },
      { llm, db: new InMemoryGrantsDb() },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.amount).toBe(50000);
    expect(out[0]!.deadline).toBe("2026-12-31");
  });

  it("splits at semantic boundaries (never mid-<li>) so a grant is not cut in half", async () => {
    // Build a big HTML with many <li> elements. The chunker should never end mid-<li>.
    const item = "<li><h3>Bando</h3><p>Descrizione lunga</p><a href=\"https://x/1\">link</a></li>";
    const bigHtml = item.repeat(600);
    const seen: string[] = [];
    const llm: LLMProvider = {
      async extract({ html }) {
        seen.push(html);
        return [];
      },
    };
    await extractGrants(
      { sourceId: "s1", url: "https://x/list", html: bigHtml },
      { llm, db: new InMemoryGrantsDb() },
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Every non-final chunk must end on a semantic boundary tag, never mid-record.
    const nonFinal = seen.slice(0, -1);
    for (const chunk of nonFinal) {
      expect(chunk).toMatch(/<\/(h2|h3|table|tr|li|p)>$/);
    }
  });
});
