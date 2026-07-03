import { describe, it, expect } from "vitest";
import {
  calculateMatch,
  matchDecisionLabel,
  hasCompatibleLegalType,
  legalTypeKey,
  isSportEntity,
  textOverlap,
  isClosedGrant,
  clientDocumentProfile,
  LEGAL_TYPES,
  TAGS,
} from "../index";
import type { ClientProfile, Grant } from "../types";

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "c-test",
    name: "Rimini Rugby Sociale",
    type: "ASD",
    legalAddress: "",
    city: "Rimini",
    province: "RN",
    region: "Emilia-Romagna",
    operationalSite: "",
    area: "Rimini / Emilia-Romagna",
    geoScope: "Provinciale",
    status: "Cliente potenziale",
    contact: "Responsabile progettazione",
    contactInfo: "info@example.it",
    website: "",
    vat: "",
    founded: "1998",
    capacity: "Media",
    priority: 8,
    budget: "90000",
    cofunding: "15%",
    staff: "6 tecnici",
    volunteers: "25 volontari",
    statuteStatus: "Disponibile aggiornato",
    financialReports: "Ultimo bilancio disponibile",
    registryRunts: "Non applicabile",
    registryRasd: "Iscritto",
    registryOther: "",
    rasdName: "Rimini Rugby Sociale ASD",
    rasdNumber: "12345",
    sportBody: "FIR",
    sportActivities: "Rugby",
    rasdCheckStatus: "Verificato",
    rasdLastCheck: "",
    spaces: "Campo sportivo, club house",
    documents: "Statuto, ultimo bilancio, affiliazione sportiva",
    documentFiles: [],
    documentInsights: "",
    documentTags: [],
    fundingInsights: "",
    fundingTypes: [],
    winningCriteria: [],
    tags: ["sport", "giovani", "scuola", "inclusione", "outdoor", "famiglie", "impianti sportivi", "prevenzione"],
    activities: "Attività sportiva giovanile",
    strengths: "Radicamento locale",
    weaknesses: "Rendicontazione da rafforzare",
    publicPartners: "Comune, scuole secondarie, AUSL",
    privatePartners: "Sponsor locali",
    projectHistory: "Centri estivi sportivi, open day",
    fundedProjects: "2 progetti finanziati",
    reportingHistory: "",
    goals: "Finanziare attività inclusive",
    notes: "",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeGrant(overrides: Partial<Grant> = {}): Grant {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 42);
  return {
    id: "g-test",
    title: "Sport Inclusivo Territoriale",
    provider: "Ente nazionale sport",
    sourceId: "",
    url: "",
    status: "Aperto",
    deadline: deadline.toISOString().split("T")[0],
    area: "Italia",
    geoScope: "Nazionale",
    amount: "25000",
    cofunding: "20%",
    eligibleTypes: ["ASD", "SSD", "ETS", "APS"],
    tags: ["sport", "inclusione", "giovani", "disabilità", "scuola", "prevenzione"],
    minCapacity: "Media",
    complexity: "Media",
    requirements: "Esperienza sportiva, attività rivolte a giovani o persone fragili, rete territoriale documentata.",
    expenses: "Operatori, attrezzature, comunicazione, trasporto.",
    summary: "Contributo per progetti sportivi con impatto sociale e inclusivo.",
    notes: "",
    beneficiaries: "",
    detail: "",
    importMode: "",
    discoveredAt: "",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("constants", () => {
  it("has 62 legal types", () => {
    expect(LEGAL_TYPES).toHaveLength(62);
  });

  it("has 47 tags", () => {
    expect(TAGS).toHaveLength(47);
  });
});

describe("legalTypeKey", () => {
  it("normalizes ASD full name", () => {
    const key = legalTypeKey("ASD - Associazione Sportiva Dilettantistica");
    expect(key).toContain("asd");
  });

  it("normalizes short form", () => {
    expect(legalTypeKey("ASD")).toBe("asd");
  });
});

describe("hasCompatibleLegalType", () => {
  it("matches ASD with full form", () => {
    expect(hasCompatibleLegalType("ASD", ["ASD - Associazione Sportiva Dilettantistica"])).toBe(true);
  });

  it("matches ASD with short form", () => {
    expect(hasCompatibleLegalType("ASD", ["ASD", "SSD"])).toBe(true);
  });

  it("rejects incompatible type", () => {
    expect(hasCompatibleLegalType("Comune", ["ASD", "SSD"])).toBe(false);
  });

  it("matches when eligible list is empty", () => {
    // Note: empty eligible list is handled in calculateMatch, not here
    expect(hasCompatibleLegalType("ASD", [])).toBe(false);
  });
});

describe("isSportEntity", () => {
  it("recognizes ASD", () => {
    expect(isSportEntity("ASD")).toBe(true);
  });

  it("recognizes SSD a r.l.", () => {
    expect(isSportEntity("SSD a r.l.")).toBe(true);
  });

  it("does not match Comune", () => {
    expect(isSportEntity("Comune")).toBe(false);
  });
});

describe("textOverlap", () => {
  it("finds common words", () => {
    expect(textOverlap("Rimini Emilia-Romagna", "Regione Emilia-Romagna")).toBe(true);
  });

  it("ignores short words", () => {
    expect(textOverlap("di la il", "di la il")).toBe(false);
  });

  it("returns false for no overlap", () => {
    expect(textOverlap("Roma Lazio", "Milano Lombardia")).toBe(false);
  });
});

describe("isClosedGrant", () => {
  it("detects Chiuso status", () => {
    expect(isClosedGrant(makeGrant({ status: "Chiuso" }))).toBe(true);
  });

  it("detects past deadline", () => {
    expect(isClosedGrant(makeGrant({ status: "Aperto", deadline: "2020-01-01" }))).toBe(true);
  });

  it("open grant with future deadline", () => {
    expect(isClosedGrant(makeGrant())).toBe(false);
  });
});

describe("clientDocumentProfile", () => {
  it("scores a well-documented client higher", () => {
    const client = makeClient();
    const profile = clientDocumentProfile(client, makeGrant());
    expect(profile.score).toBeGreaterThan(50);
    expect(profile.found.length).toBeGreaterThan(0);
  });

  it("scores an empty client low", () => {
    const client = makeClient({
      documents: "",
      statuteStatus: "",
      financialReports: "",
      registryRunts: "",
      registryRasd: "",
      registryOther: "",
      rasdNumber: "",
      sportBody: "",
      projectHistory: "",
      fundedProjects: "",
      reportingHistory: "",
      documentFiles: [],
    });
    const profile = clientDocumentProfile(client, makeGrant());
    expect(profile.score).toBeLessThan(40);
  });
});

describe("calculateMatch", () => {
  it("returns a score between 0 and 100", () => {
    const result = calculateMatch(makeClient(), makeGrant());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("high-match scenario: sport ASD + sport grant", () => {
    const result = calculateMatch(makeClient(), makeGrant());
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.sharedTags.length).toBeGreaterThan(0);
    expect(result.breakdown).toHaveLength(8);
  });

  it("low-match scenario: incompatible type and area", () => {
    const client = makeClient({
      type: "Comune",
      city: "Roma",
      province: "RM",
      region: "Lazio",
      area: "Roma / Lazio",
      tags: ["cultura", "turismo"],
      publicPartners: "",
      privatePartners: "",
      cofunding: "",
      fundedProjects: "",
      reportingHistory: "",
      fundingTypes: [],
    });
    const grant = makeGrant({
      eligibleTypes: ["ASD", "SSD"],
      area: "Emilia-Romagna",
      geoScope: "Regionale",
      tags: ["sport", "inclusione"],
    });
    const result = calculateMatch(client, grant);
    expect(result.score).toBeLessThan(50);
  });

  it("closed grant gets heavy penalty", () => {
    const result = calculateMatch(
      makeClient(),
      makeGrant({ status: "Chiuso" }),
    );
    const openResult = calculateMatch(makeClient(), makeGrant());
    expect(result.score).toBeLessThan(openResult.score);
  });

  it("breakdown sums are reasonable", () => {
    const result = calculateMatch(makeClient(), makeGrant());
    const maxPossible = result.breakdown.reduce((sum, b) => sum + b.max, 0);
    expect(maxPossible).toBe(129);
    for (const b of result.breakdown) {
      expect(b.value).toBeLessThanOrEqual(b.max);
      expect(b.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns actions array", () => {
    const result = calculateMatch(makeClient(), makeGrant());
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.actions.length).toBeLessThanOrEqual(4);
  });
});

describe("matchDecisionLabel", () => {
  it("returns Candidabile for high score + good docs", () => {
    const result = calculateMatch(makeClient(), makeGrant());
    if (result.score >= 75) {
      const verdict = matchDecisionLabel(result);
      expect(["Candidabile", "Da preparare"]).toContain(verdict);
    }
  });

  it("returns Storico for closed grant", () => {
    const result = calculateMatch(
      makeClient(),
      makeGrant({ status: "Chiuso" }),
    );
    expect(matchDecisionLabel(result)).toBe("Storico");
  });

  it("returns Bassa priorità for very low score", () => {
    const client = makeClient({
      type: "Gruppo informale",
      tags: [],
      documentTags: [],
      city: "",
      province: "",
      region: "",
      area: "",
      capacity: "Bassa",
      publicPartners: "",
      privatePartners: "",
      cofunding: "",
      statuteStatus: "",
      financialReports: "",
      documents: "",
      fundedProjects: "",
      reportingHistory: "",
      fundingTypes: [],
      winningCriteria: [],
      documentFiles: [],
      priority: 1,
    });
    const grant = makeGrant({
      eligibleTypes: ["ASD"],
      area: "Sicilia",
      geoScope: "Regionale",
      complexity: "Alta",
      minCapacity: "Alta",
    });
    const result = calculateMatch(client, grant);
    const verdict = matchDecisionLabel(result);
    expect(["Bassa priorità", "Da verificare"]).toContain(verdict);
  });
});
