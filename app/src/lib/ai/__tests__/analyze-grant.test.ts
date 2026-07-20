import { describe, it, expect } from "vitest";
import { analyzeGrant, buildAnalysisDocument, type AnalysisProfileInput } from "../analyze-grant";
import type { LLMProvider } from "../provider";
import type { EntityProfile, Grant } from "@/lib/matching";

const profile: EntityProfile = {
  legalType: "APS - Associazione di Promozione Sociale",
  province: "BO", region: "Emilia-Romagna", operatingProvinces: ["MO"],
  themes: ["sport", "giovani"],
  capacity: null,
  documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
  publicPartners: true, privatePartners: false,
  projectHistory: [{ grantName: "Vecchio bando", providerId: null, year: 2024, outcome: "finanziato", amount: 10000, kind: "pubblico" }],
  fundingTypesReceived: ["pubblico"],
  cofundingCapacity: 20,
};

const input: AnalysisProfileInput = {
  profile, name: "ASD Futuro", activityDescription: "Sport per ragazzi in periferia",
};

const grant: Grant = {
  id: "g1", title: "Bando Sport Giovani", providerId: "p1", providerKind: "privato",
  deadline: "2026-12-31", status: "aperto", amount: 50000, cofundingRequired: 20,
  cofundingPercentage: 20,
  eligibleTypes: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
  area: "Emilia-Romagna", geoScope: "regionale", complexity: "media",
  requiredDocuments: ["statuto"], summary: "Sostegno allo sport giovanile",
  requirements: "Sede in regione", url: "https://x/bando", beneficiaries: "Giovani 14-18",
  openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  eligibleExpenses: null, applicationMethod: null, contactInfo: null,
  grantType: "bando",
};

const validOutput = {
  punti_di_forza: ["Temi perfettamente allineati (sport, giovani)"],
  rischi: ["Cofinanziamento del 20% da coprire"],
  suggerimenti: ["Valorizza il progetto finanziato nel 2024"],
  passi_successivi: ["Prepara il bilancio aggiornato"],
};

function llmReturning(value: unknown): LLMProvider {
  return { name: "stub", extract: async () => value };
}

describe("buildAnalysisDocument", () => {
  it("cites real profile and grant elements (not generic)", () => {
    const doc = buildAnalysisDocument(input, grant, "Fondazione Test");
    for (const needle of [
      "ASD Futuro", "APS - Associazione di Promozione Sociale", "Emilia-Romagna",
      "sport, giovani", "Sport per ragazzi in periferia", "Progetti finanziati in passato: 1",
      "Bando Sport Giovani", "Fondazione Test", "2026-12-31", "€ 50000",
    ]) {
      expect(doc).toContain(needle);
    }
  });
});

describe("analyzeGrant", () => {
  it("returns the validated analysis for well-formed provider output", async () => {
    const out = await analyzeGrant(llmReturning(validOutput), input, grant, "Fondazione Test");
    expect(out.puntiDiForza).toEqual(validOutput.punti_di_forza);
    expect(out.passiSuccessivi).toEqual(validOutput.passi_successivi);
  });

  it("accepts a JSON string payload", async () => {
    const out = await analyzeGrant(llmReturning(JSON.stringify(validOutput)), input, grant, null);
    expect(out.rischi).toEqual(validOutput.rischi);
  });

  it("throws on malformed output (never rendered raw)", async () => {
    for (const bad of [
      "non-json testo libero",
      { punti_di_forza: "una stringa, non un array" },
      { punti_di_forza: [42] },
      null,
    ]) {
      await expect(analyzeGrant(llmReturning(bad), input, grant, null)).rejects.toThrow();
    }
  });

  it("throws when every section is empty", async () => {
    const empty = { punti_di_forza: [], rischi: [], suggerimenti: [], passi_successivi: [] };
    await expect(analyzeGrant(llmReturning(empty), input, grant, null)).rejects.toThrow();
  });
});
