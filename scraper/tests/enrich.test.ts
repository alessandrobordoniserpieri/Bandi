import { describe, it, expect } from "vitest";
import { enrich, parseItalianAmount } from "../src/pipeline/enrich";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, deadline: null, status: null,
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null, ...over,
  };
}

describe("parseItalianAmount", () => {
  it("parses '1.000.000 €' → 1000000", () => expect(parseItalianAmount("1.000.000 €")).toBe(1000000));
  it("parses '50.000' → 50000", () => expect(parseItalianAmount("50.000")).toBe(50000));
  it("parses '€ 20.000,50' → 20000.5", () => expect(parseItalianAmount("€ 20.000,50")).toBe(20000.5));
  it("returns null for junk", () => expect(parseItalianAmount("boh")).toBeNull());
});

describe("enrich", () => {
  it("defaults status to aperto when null", () => {
    expect(enrich(g({ status: null })).status).toBe("aperto");
    expect(enrich(g({ status: "chiuso" })).status).toBe("chiuso");
  });
  it("infers geoScope from area when null", () => {
    expect(enrich(g({ area: "Italia" })).geoScope).toBe("nazionale");
    expect(enrich(g({ area: "Lombardia" })).geoScope).toBe("regionale");
    expect(enrich(g({ area: "Unione Europea" })).geoScope).toBe("europeo");
  });
  it("does not overwrite an existing geoScope", () => {
    expect(enrich(g({ area: "Italia", geoScope: "comunale" })).geoScope).toBe("comunale");
  });
});
