import { describe, it, expect } from "vitest";
import { enrich, parseItalianAmount } from "../src/pipeline/enrich";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, sourceId: null, deadline: null, status: null,
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null,
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
  };
}

describe("parseItalianAmount", () => {
  it("parses '1.000.000 €' → 1000000", () => expect(parseItalianAmount("1.000.000 €")).toBe(1000000));
  it("parses '50.000' → 50000", () => expect(parseItalianAmount("50.000")).toBe(50000));
  it("parses '€ 20.000,50' → 20000.5", () => expect(parseItalianAmount("€ 20.000,50")).toBe(20000.5));
  // Spelled-out currency (Sport e Salute cards say "Risorse: Euro 900.000"): the word must be
  // stripped like the symbol, or Number() sees letters and the amount is silently dropped.
  it("parses 'Euro 900.000' → 900000", () => expect(parseItalianAmount("Euro 900.000")).toBe(900000));
  it("parses '794.263,35 EUR' → 794263.35", () => expect(parseItalianAmount("794.263,35 EUR")).toBe(794263.35));
  it("returns null for junk", () => expect(parseItalianAmount("boh")).toBeNull());

  // A total stated in prose, followed by a breakdown ("di cui:", "Ripartizione:"), makes the
  // whole-string parse above fail (extra non-numeric text) even though a clean total is present.
  // Real cases: sportesalute's "Risorse: Euro 400.000,00, di cui: Linea 1 - ...; Linea 2 - ...";
  // ER Sociale's "...ammontano a euro 1.371.182,26. Ripartizione territoriale: ...".
  it("pulls the first (total) figure out of 'Euro N, di cui: ...' breakdown text", () =>
    expect(parseItalianAmount(
      "Euro 400.000,00, di cui: Linea 1 - Euro 100.000,00; Linea 2 - Euro 300.000,00",
    )).toBe(400000));
  it("pulls the first (total) figure out of 'ammontano a euro N. Ripartizione: ...' text", () =>
    expect(parseItalianAmount(
      "Le risorse complessivamente destinate ammontano a euro 1.371.182,26. Ripartizione territoriale: Raggruppamento Ovest: euro 843.522,70; Raggruppamento Est: euro 527.659,58.",
    )).toBe(1371182.26));
  it("still returns null when no currency-adjacent figure exists in free text", () =>
    expect(parseItalianAmount("Nel 2027 arriveranno altri fondi per il settore.")).toBeNull());
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
