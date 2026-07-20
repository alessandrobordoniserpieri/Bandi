import { describe, it, expect } from "vitest";
import { buildMatchedGrants } from "../match-list";
import type { GrantView } from "../mapping";
import type { EntityProfile, Grant } from "@/lib/matching";

// Minimal profile — exact scores don't matter; relative ordering does.
function profile(): EntityProfile {
  return {
    legalType: "APS - Associazione di Promozione Sociale",
    province: "MI", region: "Lombardia", operatingProvinces: [],
    themes: ["sport"], capacity: null,
    documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
    publicPartners: false, privatePartners: false, projectHistory: [],
    fundingTypesReceived: [], cofundingCapacity: null,
  };
}
function grant(id: string, over: Partial<Grant> = {}): Grant {
  return {
    id, title: id, providerId: null, providerKind: null,
    deadline: "2026-12-31", status: "aperto", amount: null, cofundingRequired: null,
    cofundingPercentage: null,
    eligibleTypes: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
    area: null, geoScope: null, complexity: null, requiredDocuments: [],
    summary: "", requirements: "", url: `https://x/${id}`, beneficiaries: "",
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    grantType: "bando", ...over,
  };
}
function view(g: Grant): GrantView { return { grant: g, providerName: null }; }

describe("buildMatchedGrants", () => {
  it("sorts open grants by score descending", () => {
    // strong match vs weak match (wrong type + no shared tag)
    const strong = view(grant("strong"));
    const weak = view(grant("weak", { eligibleTypes: ["Comune"], tags: ["cultura"] }));
    const out = buildMatchedGrants(profile(), [weak, strong]);
    expect(out.map((m) => m.grant.id)).toEqual(["strong", "weak"]);
    expect(out[0].match.score).toBeGreaterThanOrEqual(out[1].match.score);
  });

  it("puts closed grants (verdict Storico) after all open grants, even with a higher raw score", () => {
    const closedStrong = view(grant("closed", { status: "chiuso", deadline: "2020-01-01" }));
    const openWeak = view(grant("open", { eligibleTypes: ["Comune"], tags: ["cultura"] }));
    const out = buildMatchedGrants(profile(), [closedStrong, openWeak]);
    expect(out.map((m) => m.grant.id)).toEqual(["open", "closed"]);
    expect(out[1].match.verdict).toBe("Storico");
  });

  it("is stable for equal-score open grants (preserves input order)", () => {
    const a = view(grant("a"));
    const b = view(grant("b"));
    const out = buildMatchedGrants(profile(), [a, b]);
    // identical grants → identical score → input order kept
    expect(out.map((m) => m.grant.id)).toEqual(["a", "b"]);
  });
});
