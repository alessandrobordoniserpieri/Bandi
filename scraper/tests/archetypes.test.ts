import { describe, it, expect } from "vitest";
import { resolveArchetype, ARCHETYPES, DEFAULT_ARCHETYPE } from "../src/pipeline/archetypes";
import { FULL_ARCHETYPE, extractGrants } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";

const page = (html: string): RawPage => ({ sourceId: "s1", url: "https://x/list", html });

describe("resolveArchetype", () => {
  it("returns the full archetype by default (missing key)", () => {
    expect(resolveArchetype(undefined)).toBe(FULL_ARCHETYPE);
    expect(DEFAULT_ARCHETYPE).toBe(FULL_ARCHETYPE);
  });

  it("resolves a known key to its archetype", () => {
    expect(resolveArchetype("listing-light").name).toBe("listing-light");
    expect(resolveArchetype("full")).toBe(FULL_ARCHETYPE);
  });

  it("falls back to full on an unknown key", () => {
    expect(resolveArchetype("does-not-exist")).toBe(FULL_ARCHETYPE);
  });

  it("registers both full and listing-light", () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(["full", "listing-light"]);
  });
});

describe("archetype fields", () => {
  it("full carries all 16 fields, detail optional; listing-light is minimal, detail required", () => {
    const full = resolveArchetype("full");
    const light = resolveArchetype("listing-light");
    expect(full.detailRequired).toBe(false);
    expect(light.detailRequired).toBe(true);
    // The light listing schema exposes only title/url/deadline.
    const lightProps = (light.listing.schema.items as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(lightProps).sort()).toEqual(["deadline", "title", "url"]);
  });
});

describe("extractGrants honors the archetype", () => {
  it("uses the archetype's custom sanitize before chunking/extraction", async () => {
    let sawSanitize = false;
    const archetype = {
      ...FULL_ARCHETYPE,
      name: "custom",
      sanitize: (html: string) => { sawSanitize = true; return html; },
    };
    const llm = new FakeLLMProvider(new Map<string, unknown>([["H", [{ title: "B", url: "https://x/1" }]]]));
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() }, archetype);
    expect(sawSanitize).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("skips URL snapping when the archetype disables it", async () => {
    const html = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const hallucinated = "https://example.it/bando-for-x";
    const noSnap = { ...FULL_ARCHETYPE, name: "no-snap", urlSnapping: false };
    const llm = new FakeLLMProvider(new Map<string, unknown>([[html, [{ title: "B", url: hallucinated }]]]));
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() }, noSnap);
    // Without snapping the hallucinated URL is kept as-is.
    expect(out[0]!.url).toBe(hallucinated);
  });

  it("still snaps the URL under the default (full) archetype", async () => {
    const html = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const hallucinated = "https://example.it/bando-for-x";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[html, [{ title: "B", url: hallucinated }]]]));
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out[0]!.url).toBe("https://example.it/bando-per-x");
  });
});
