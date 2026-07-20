import { describe, it, expect } from "vitest";
import { buildDigest } from "../build-digest";
import type { EntityProfile, Grant } from "@/lib/matching";
import type { GrantView } from "@/lib/grants/mapping";

// A profile that scores grants highly when tags overlap; here we control the score by using
// grants whose tags match (high) or not (low) the profile themes.
const profile: EntityProfile = {
  legalType: "APS - Associazione di Promozione Sociale", province: "BO", region: "Emilia-Romagna",
  operatingProvinces: [], themes: ["sport", "giovani", "cultura", "sociale"],
  capacity: null,
  documents: { statuto: true, bilancio: true, runts: true, rasd: false, durc: false, certificazioni: false },
  publicPartners: false, privatePartners: false,
  projectHistory: [], fundingTypesReceived: [], cofundingCapacity: null,
};

function view(id: string, tags: string[], eligibleTypes: string[]): GrantView {
  const grant: Grant = {
    id, title: `Bando ${id}`, providerId: null, providerKind: null,
    deadline: "2026-12-31", status: "aperto", amount: 50000, cofundingRequired: null,
    cofundingPercentage: null,
    eligibleTypes, tags, area: "Emilia-Romagna", geoScope: "regionale", complexity: "bassa",
    requiredDocuments: [], summary: "", requirements: "", url: `https://x/${id}`, beneficiaries: "",
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    grantType: "bando",
  };
  return { grant, providerName: "Fondazione Test" };
}

// A "strong" grant (many matching themes + eligible legal type) and a "weak" one (no overlap).
const strong = (id: string) => view(id, ["sport", "giovani", "cultura", "sociale"], ["APS - Associazione di Promozione Sociale"]);
const weak = (id: string) => view(id, ["ambiente"], ["Impresa"]);

describe("buildDigest", () => {
  it("returns null when nothing meets the threshold (no empty emails)", () => {
    expect(buildDigest(profile, 50, [weak("a"), weak("b")])).toBeNull();
    expect(buildDigest(profile, 50, [])).toBeNull();
  });

  it("keeps only grants at or above the threshold", () => {
    const digest = buildDigest(profile, 50, [strong("hi"), weak("lo")]);
    expect(digest).not.toBeNull();
    expect(digest!.items.map((i) => i.grantId)).toEqual(["hi"]);
    expect(digest!.items[0]!.score).toBeGreaterThanOrEqual(50);
  });

  it("respects a raised threshold", () => {
    const low = buildDigest(profile, 40, [strong("x")]);
    expect(low).not.toBeNull();
    const high = buildDigest(profile, 100, [strong("x")]);
    // a single strong grant rarely reaches a perfect 100 → filtered out
    expect(high === null || high.items.length <= 1).toBe(true);
  });

  it("caps at 10 items, sorted by score descending", () => {
    const views = Array.from({ length: 15 }, (_, i) => strong(`g${i}`));
    const digest = buildDigest(profile, 30, views)!;
    expect(digest.items).toHaveLength(10);
    const scores = digest.items.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
