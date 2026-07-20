import { describe, it, expect } from "vitest";
import { saveGrant } from "../src/pipeline/save";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant> = {}): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, sourceId: "s1", deadline: null, status: "aperto",
    grantType: "bando",
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null,
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
  };
}

// docs/superpowers/specs/2026-07-20-source-id-detail-priority-attribution.md
describe("saveGrant — source_id reattribution on duplicate URLs", () => {
  it("a detailEnabled source takes over source_id from a non-detailEnabled owner", async () => {
    const db = new InMemoryGrantsDb();
    // s1 (non-detailEnabled, e.g. an aggregator) scrapes it first.
    await saveGrant(g({ sourceId: "s1" }), db, {
      detailEnabledBySource: new Map([["s1", false], ["s2", true]]),
      incomingDetailEnabled: false,
    });
    // s2 (detailEnabled) sees the same URL next.
    const outcome = await saveGrant(g({ sourceId: "s2" }), db, {
      detailEnabledBySource: new Map([["s1", false], ["s2", true]]),
      incomingDetailEnabled: true,
    });
    expect(outcome).toBe("updated");
    expect(db.grants[0]!.sourceId).toBe("s2");
  });

  it("does not reattribute once the owner's detail has already been fetched", async () => {
    const db = new InMemoryGrantsDb();
    const caps = new Map([["s1", true], ["s2", true]]);
    await saveGrant(g({ sourceId: "s1" }), db, { detailEnabledBySource: caps, incomingDetailEnabled: true });
    await db.markDetailFetched(db.grants[0]!.id, {});
    const outcome = await saveGrant(g({ sourceId: "s2" }), db, { detailEnabledBySource: caps, incomingDetailEnabled: true });
    expect(outcome).toBe("skipped"); // no field actually changed, sourceId included
    expect(db.grants[0]!.sourceId).toBe("s1");
  });

  it("leaves last-writer-wins behavior unchanged when both sources are non-detailEnabled", async () => {
    const db = new InMemoryGrantsDb();
    const caps = new Map([["s1", false], ["s2", false]]);
    await saveGrant(g({ sourceId: "s1" }), db, { detailEnabledBySource: caps, incomingDetailEnabled: false });
    const outcome = await saveGrant(g({ sourceId: "s2" }), db, { detailEnabledBySource: caps, incomingDetailEnabled: false });
    expect(outcome).toBe("updated");
    expect(db.grants[0]!.sourceId).toBe("s2");
  });
});
