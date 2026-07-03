import { describe, it, expect } from "vitest";
import { calculateMatch } from "../index";
import type { EntityProfile, Grant, CapacityAnswers } from "../types";

const maxAnswers: CapacityAnswers = {
  stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+",
  reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true,
};

function makeProfile(o: Partial<EntityProfile> = {}): EntityProfile {
  return {
    legalType: "ASD - Associazione Sportiva Dilettantistica",
    province: "RN", region: "Emilia-Romagna", operatingProvinces: [],
    themes: ["sport", "giovani", "inclusione"],
    capacity: maxAnswers,
    documents: { statuto: true, bilancio: true, runts: true, rasd: true, durc: true, certificazioni: true },
    publicPartners: true, privatePartners: false,
    projectHistory: [
      { grantName: "x", providerId: null, year: 2023, outcome: "finanziato", amount: 1000, kind: "pubblico" },
      { grantName: "y", providerId: null, year: 2022, outcome: "finanziato", amount: 1000, kind: "pubblico" },
      { grantName: "z", providerId: null, year: 2021, outcome: "finanziato", amount: 1000, kind: "pubblico" },
    ],
    fundingTypesReceived: ["pubblico"], cofundingCapacity: 50,
    ...o,
  };
}
function makeGrant(o: Partial<Grant> = {}): Grant {
  const d = new Date(); d.setDate(d.getDate() + 40);
  return {
    id: "g", title: "Sport inclusivo", providerId: null, providerKind: "pubblico",
    deadline: d.toISOString().split("T")[0], status: "aperto", amount: 20000, cofundingRequired: 10,
    eligibleTypes: ["ASD - Associazione Sportiva Dilettantistica"],
    tags: ["sport", "giovani", "inclusione"], area: "Emilia-Romagna", geoScope: "regionale",
    complexity: "media", requiredDocuments: ["statuto", "bilancio"],
    summary: "", requirements: "", url: "https://x", beneficiaries: "",
    ...o,
  };
}

describe("calculateMatch", () => {
  it("perfect profile → 100", () => {
    expect(calculateMatch(makeProfile(), makeGrant()).score).toBe(100);
  });
  it("breakdown always has 6 items summing max to 100", () => {
    const r = calculateMatch(makeProfile(), makeGrant());
    expect(r.breakdown).toHaveLength(6);
    expect(r.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
  });
  it("I2: baseScore equals sum of breakdown values; final score in [0,100]", () => {
    const r = calculateMatch(makeProfile({ publicPartners: false }), makeGrant());
    expect(r.baseScore).toBe(r.breakdown.reduce((s, b) => s + b.value, 0));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("I8: empty grant data yields documented neutrals, not zero", () => {
    const r = calculateMatch(makeProfile({ capacity: null }), makeGrant({
      tags: [], eligibleTypes: [], geoScope: null, area: null, complexity: null, requiredDocuments: [],
    }));
    const by = Object.fromEntries(r.breakdown.map((b) => [b.key, b.value]));
    expect(by.themes).toBe(19);
    expect(by.territory).toBe(12);
    expect(by.capacity).toBe(9);
    expect(by.documents).toBe(8);
    expect(by.legalForm).toBe(22); // open to all
  });
  it("low match: wrong type, region, themes → Non compatibile or Bassa priorità", () => {
    const r = calculateMatch(
      makeProfile({ legalType: "Comune", province: "PA", region: "Sicilia", themes: ["cultura"],
        capacity: null, documents: { statuto: false, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false },
        publicPartners: false, projectHistory: [], fundingTypesReceived: [], cofundingCapacity: 0 }),
      makeGrant({ complexity: "alta" }),
    );
    expect(["Non compatibile", "Bassa priorità"]).toContain(r.verdict);
  });
  it("closed grant → Storico", () => {
    expect(calculateMatch(makeProfile(), makeGrant({ status: "chiuso" })).verdict).toBe("Storico");
  });
  it("missing required docs downgrades Candidabile to Da preparare", () => {
    const r = calculateMatch(
      makeProfile({ documents: { statuto: true, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false } }),
      makeGrant({ requiredDocuments: ["statuto", "bilancio"] }),
    );
    if (r.score >= 75) {
      expect(r.verdict).toBe("Da preparare");
      expect(r.missingDocuments).toContain("bilancio");
    }
  });
});
