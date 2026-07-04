import { describe, it, expect } from "vitest";
import { normalizeUrl, diffGrant, decide } from "../src/pipeline/dedup";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, deadline: null, status: "aperto",
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null, ...over,
  };
}

describe("normalizeUrl", () => {
  it("strips tracking params and trailing slash, lowercases host", () => {
    expect(normalizeUrl("https://Example.IT/bando/?utm_source=news&fbclid=1"))
      .toBe("https://example.it/bando");
  });
  it("keeps meaningful query params, sorted, and drops the fragment", () => {
    expect(normalizeUrl("https://x.it/a?b=2&a=1#frag")).toBe("https://x.it/a?a=1&b=2");
  });
  it("treats slash/no-slash and case-different host as the same key", () => {
    expect(normalizeUrl("https://X.it/p/")).toBe(normalizeUrl("https://x.it/p"));
  });
});

describe("diffGrant / decide", () => {
  it("empty diff when nothing changed → skip", () => {
    const a = g({ amount: 1000, tags: ["sport"] });
    expect(diffGrant(a, g({ amount: 1000, tags: ["sport"] }))).toEqual({});
    expect(decide(a, g({ amount: 1000, tags: ["sport"] }))).toEqual({ action: "skip" });
  });
  it("diff contains only the changed fields → update", () => {
    const incoming = g({ amount: 2000, tags: ["sport"] });
    const existing = g({ amount: 1000, tags: ["sport"] });
    expect(diffGrant(incoming, existing)).toEqual({ amount: 2000 });
    expect(decide(incoming, existing)).toEqual({ action: "update", patch: { amount: 2000 } });
  });
  it("insert when existing is null", () => {
    expect(decide(g({}), null)).toEqual({ action: "insert" });
  });
  it("treats tags in a different order as equal (no spurious update)", () => {
    const incoming = g({ tags: ["sport", "giovani"] });
    const existing = g({ tags: ["giovani", "sport"] });
    expect(diffGrant(incoming, existing)).toEqual({});
    expect(decide(incoming, existing)).toEqual({ action: "skip" });
  });
});
