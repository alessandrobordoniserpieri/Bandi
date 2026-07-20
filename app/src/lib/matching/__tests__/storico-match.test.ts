import { describe, it, expect } from "vitest";
import { matchHistory, nameSimilarity, normalizeName } from "../storico-match";
import { calculateMatch } from "../calculate-match";
import type { EntityProfile, Grant, ProjectHistoryRow } from "../types";

const grant = (over: Partial<Grant> = {}): Grant => ({
  id: "g1", title: "Bando Sport", providerId: "prov-1", providerKind: "privato",
  deadline: "2026-12-31", status: "aperto", amount: 50000, cofundingRequired: null,
  cofundingPercentage: null,
  eligibleTypes: [], tags: [], area: null, geoScope: null, complexity: null,
  requiredDocuments: [], summary: "", requirements: "", url: "https://x", beneficiaries: "",
  openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  eligibleExpenses: null, applicationMethod: null, contactInfo: null,
  grantType: "bando", ...over,
});

const row = (over: Partial<ProjectHistoryRow> = {}): ProjectHistoryRow => ({
  grantName: "Altro progetto", providerId: null, year: 2024, outcome: "non_ammesso", amount: null, kind: null, ...over,
});

describe("matchHistory — badges (§2.8)", () => {
  it("same provider + same bando funded → Già finanziato", () => {
    const h = [row({ providerId: "prov-1", grantName: "Bando Sport", outcome: "finanziato" })];
    expect(matchHistory(h, grant())?.kind).toBe("gia_finanziato");
  });

  it("same provider, different bando → Conosce l'erogatore", () => {
    const h = [row({ providerId: "prov-1", grantName: "Tutt'altra iniziativa", outcome: "finanziato" })];
    expect(matchHistory(h, grant())?.kind).toBe("conosce_erogatore");
  });

  it("fuzzy name match despite edition/year noise → grant-level badge", () => {
    const h = [row({ providerId: null, grantName: "Bando Sport 2024 — edizione 2024", outcome: "non_ammesso" })];
    expect(matchHistory(h, grant())?.kind).toBe("gia_candidato");
  });

  it("name match + funded → Già finanziato even with a null provider", () => {
    const h = [row({ providerId: null, grantName: "Bando Sport", outcome: "finanziato" })];
    expect(matchHistory(h, grant())?.kind).toBe("gia_finanziato");
  });

  it("different names and different provider → null", () => {
    const h = [row({ providerId: "prov-9", grantName: "Progetto Ambiente" })];
    expect(matchHistory(h, grant())).toBeNull();
  });

  it("empty history → null", () => {
    expect(matchHistory([], grant())).toBeNull();
  });

  it("priority: finanziato > candidato > conosce", () => {
    const h = [
      row({ providerId: "prov-1", grantName: "Vecchio bando", outcome: "finanziato" }), // conosce
      row({ providerId: null, grantName: "Bando Sport", outcome: "non_ammesso" }),       // candidato
      row({ providerId: null, grantName: "Bando Sport", outcome: "finanziato" }),        // finanziato
    ];
    expect(matchHistory(h, grant())?.kind).toBe("gia_finanziato");
  });
});

describe("normalizeName", () => {
  it("strips year, edizione, punctuation, case and collapses spaces", () => {
    expect(normalizeName("Bando  Sport 2024 — edizione 2024!")).toBe("bando sport");
    expect(normalizeName("Fondazione X S.p.A.")).toBe("fondazione x");
  });
});

// 20 real-ish name pairs: 10 expected to match (>=0.85 after normalization), 10 not.
describe("nameSimilarity — controlled false positives (10 match / 10 no)", () => {
  const MATCH: [string, string][] = [
    ["Bando Sport 2024", "Bando Sport 2025"],
    ["Bando Sport e Salute — edizione 2024", "Bando Sport e Salute"],
    ["Contributi Cultura 2023", "Contributi Cultura"],
    ["Fondo Terzo Settore ETS", "Fondo Terzo Settore"],
    ["Bando Periferie 2022", "bando periferie"],
    ["Avviso Giovani Protagonisti", "Avviso Giovani Protagonisti!"],
    ["Bando Inclusione Sociale 2024", "Bando Inclusione Sociale 2021"],
    ["Progetto Comunità Educante", "Progetto Comunità Educanti"],
    ["Bando Ambiente e Territorio", "Bando Ambiente e Territorio 2024"],
    ["Contributo Impiantistica Sportiva", "Contributo Impiantistica Sportive"],
  ];
  const NO: [string, string][] = [
    ["Bando Sport 2024", "Bando Cultura 2024"],
    ["Contributi Ambiente", "Contributi Giovani"],
    ["Fondo Terzo Settore", "Fondo Ricerca Scientifica"],
    ["Bando Periferie", "Bando Centro Storico"],
    ["Avviso Giovani", "Avviso Anziani"],
    ["Progetto Scuola", "Progetto Lavoro"],
    ["Bando Inclusione", "Bando Innovazione"],
    ["Contributo Sport", "Contributo Teatro"],
    ["Bando Sociale", "Bando Digitale"],
    ["Fondo Cultura", "Fondo Sanità"],
  ];

  it("classifies all 10 match pairs as >= 0.85", () => {
    for (const [a, b] of MATCH) expect(nameSimilarity(a, b), `${a} ~ ${b}`).toBeGreaterThanOrEqual(0.85);
  });
  it("classifies all 10 non-pairs as < 0.85", () => {
    for (const [a, b] of NO) expect(nameSimilarity(a, b), `${a} !~ ${b}`).toBeLessThan(0.85);
  });
});

describe("the badge never alters score or verdict", () => {
  const profile: EntityProfile = {
    legalType: "APS - Associazione di Promozione Sociale", province: "BO", region: "Emilia-Romagna",
    operatingProvinces: [], themes: ["sport"], capacity: null,
    documents: { statuto: false, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false },
    publicPartners: false, privatePartners: false,
    projectHistory: [row({ providerId: "prov-1", grantName: "Bando Sport", outcome: "non_ammesso" })],
    fundingTypesReceived: [], cofundingCapacity: null,
  };

  it("changing only providerId flips the badge but leaves score/verdict identical", () => {
    const known = calculateMatch(profile, grant({ providerId: "prov-1" }));
    const unknown = calculateMatch(profile, grant({ providerId: "prov-2", title: "Tutt'altro bando" }));
    // badges differ (candidato vs null) but score/verdict are unaffected by the badge
    expect(known.historyBadge?.kind).toBe("gia_candidato");
    expect(unknown.historyBadge).toBeNull();
    expect(known.score).toBe(unknown.score);
    expect(known.verdict).toBe(unknown.verdict);
  });
});
