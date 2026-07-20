import { describe, it, expect } from "vitest";
import { normalizeUrl, diffGrant, decide } from "../src/pipeline/dedup";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant> = {}): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, sourceId: null, deadline: null, status: "aperto",
    grantType: "bando",
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null,
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
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

  it("inserts a new edition when existing is scaduto and incoming has a different deadline", () => {
    const incoming = g({ deadline: "2027-06-30" });
    const existing = g({ status: "scaduto", deadline: "2026-12-31" });
    expect(decide(incoming, existing)).toEqual({ action: "insert" });
  });

  it("skips when existing is scaduto and incoming has same deadline", () => {
    const incoming = g({ deadline: "2026-12-31" });
    const existing = g({ status: "scaduto", deadline: "2026-12-31" });
    expect(decide(incoming, existing)).toEqual({ action: "skip" });
  });

  it("skips when existing is scaduto and incoming has no deadline", () => {
    const incoming = g({ deadline: null });
    const existing = g({ status: "scaduto", deadline: "2026-12-31" });
    expect(decide(incoming, existing)).toEqual({ action: "skip" });
  });

  it("skips when existing is chiuso and incoming has same deadline", () => {
    const incoming = g({ deadline: "2026-12-31" });
    const existing = g({ status: "chiuso", deadline: "2026-12-31" });
    expect(decide(incoming, existing)).toEqual({ action: "skip" });
  });

  it("inserts a new edition when existing is chiuso and incoming has a new deadline", () => {
    const incoming = g({ deadline: "2027-01-15" });
    const existing = g({ status: "chiuso", deadline: "2026-12-31" });
    expect(decide(incoming, existing)).toEqual({ action: "insert" });
  });

  it("never blanks an existing value with null (missed re-extraction must not delete data)", () => {
    const incoming = g({ amount: null, deadline: null, tags: [], summary: null });
    const existing = g({ amount: 50000, deadline: "2026-12-31", tags: ["sport"], summary: "old" });
    expect(diffGrant(incoming, existing)).toEqual({});
    expect(decide(incoming, existing)).toEqual({ action: "skip" });
  });

  it("fills a previously-null field when re-scrape finds a value", () => {
    const incoming = g({ amount: 50000 });
    const existing = g({ amount: null });
    expect(diffGrant(incoming, existing)).toEqual({ amount: 50000 });
  });

  it("empty string / empty array in incoming does not overwrite a real existing value", () => {
    const incoming = g({ summary: "", tags: [] });
    const existing = g({ summary: "text", tags: ["sport"] });
    expect(diffGrant(incoming, existing)).toEqual({});
  });
});

// Policy (ADR): only NEW, still-open grants are ingested. A brand-new listing that is ALREADY
// expired is not back-filled — we never tracked it, so its history is not ours to import. Grants
// already in the system expire IN PLACE (the update path flips their status; the row stays).
describe("decide — skip expired grants at ingest time (only-new policy)", () => {
  const TODAY = "2026-07-17";

  it("skips inserting a brand-new grant explicitly marked scaduto", () => {
    expect(decide(g({ status: "scaduto", deadline: "2026-01-01" }), null, TODAY)).toEqual({ action: "skip" });
  });

  it("skips inserting a brand-new grant explicitly marked chiuso", () => {
    expect(decide(g({ status: "chiuso", deadline: "2026-01-01" }), null, TODAY)).toEqual({ action: "skip" });
  });

  it("skips a brand-new grant whose deadline is in the past even if status still says aperto (generic-archetype gap)", () => {
    expect(decide(g({ status: "aperto", deadline: "2026-06-30" }), null, TODAY)).toEqual({ action: "skip" });
  });

  it("still inserts a brand-new grant with a future deadline", () => {
    expect(decide(g({ status: "aperto", deadline: "2026-12-31" }), null, TODAY)).toEqual({ action: "insert" });
  });

  it("still inserts a brand-new grant with no deadline (cannot prove it's expired — e.g. rolling)", () => {
    expect(decide(g({ status: "aperto", deadline: null }), null, TODAY)).toEqual({ action: "insert" });
  });

  it("does NOT skip an already-stored grant that has since expired: the update path keeps it in place", () => {
    // existing is active in the DB (status aperto), the re-scrape now reports it expired → the row
    // is UPDATED to scaduto, never dropped. "Quando uno scade lo teniamo a sistema."
    const incoming = g({ status: "scaduto", deadline: "2026-06-30" });
    const existing = g({ status: "aperto", deadline: "2026-06-30" });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "update", patch: { status: "scaduto" } });
  });

  it("skips a NEW EDITION of an expired grant when that edition is itself already expired", () => {
    const incoming = g({ status: "scaduto", deadline: "2026-05-01" });
    const existing = g({ status: "scaduto", deadline: "2025-05-01" });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "skip" });
  });

  it("still inserts a NEW EDITION of an expired grant when that edition is still open", () => {
    const incoming = g({ status: "aperto", deadline: "2027-05-01" });
    const existing = g({ status: "scaduto", deadline: "2026-05-01" });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "insert" });
  });
});

describe("decide — skip administrative notices at ingest (proroga/rettifica/errata corrige/…)", () => {
  const TODAY = "2026-07-18";

  it("skips inserting a brand-new grant classified as amministrativo", () => {
    expect(decide(g({ grantType: "amministrativo", status: "aperto", deadline: "2026-12-31" }), null, TODAY))
      .toEqual({ action: "skip" });
  });

  it("still inserts a brand-new grant classified as co_progettazione", () => {
    expect(decide(g({ grantType: "co_progettazione", status: "aperto", deadline: "2026-12-31" }), null, TODAY))
      .toEqual({ action: "insert" });
  });

  it("skips a NEW EDITION of an expired grant when the new edition is amministrativo", () => {
    const incoming = g({ grantType: "amministrativo", status: "aperto", deadline: "2027-05-01" });
    const existing = g({ grantType: "bando", status: "scaduto", deadline: "2026-05-01" });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "skip" });
  });

  it("does not gate the update path on grantType — an active existing record updates normally", () => {
    const incoming = g({ grantType: "amministrativo", amount: 999 });
    const existing = g({ grantType: "bando", amount: 1 });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "update", patch: { amount: 999 } });
  });
});
