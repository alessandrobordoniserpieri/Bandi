import { describe, it, expect } from "vitest";
import { analyzeGrant, buildAnalysisDocument, buildStrongAnalysisDocument, isDocumentTextTruncated, MAX_DOCUMENT_TEXT_CHARS, type AnalysisProfileInput, type DocumentText } from "../analyze-grant";
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

describe("buildStrongAnalysisDocument", () => {
  it("returns exactly buildAnalysisDocument's output when there are no documents", () => {
    expect(buildStrongAnalysisDocument(input, grant, "Fondazione Test", [])).toBe(
      buildAnalysisDocument(input, grant, "Fondazione Test"),
    );
  });

  it("appends the full text of each document after the base document", () => {
    const documents: DocumentText[] = [
      { title: "Avviso pubblico.pdf", text: "Articolo 1: finalità del bando..." },
      { title: "Modulo domanda.pdf", text: "Il sottoscritto richiede il contributo..." },
    ];
    const doc = buildStrongAnalysisDocument(input, grant, "Fondazione Test", documents);
    expect(doc).toContain(buildAnalysisDocument(input, grant, "Fondazione Test"));
    expect(doc).toContain("Avviso pubblico.pdf");
    expect(doc).toContain("Articolo 1: finalità del bando...");
    expect(doc).toContain("Modulo domanda.pdf");
    expect(doc).toContain("Il sottoscritto richiede il contributo...");
  });
});

describe("analyzeGrant with documents", () => {
  it("sends the strong document (including PDF text) to the provider when documents are given", async () => {
    let capturedHtml = "";
    const llm: LLMProvider = {
      name: "stub",
      extract: async (args) => {
        capturedHtml = args.html;
        return validOutput;
      },
    };
    const documents: DocumentText[] = [{ title: "Avviso.pdf", text: "Testo unico riconoscibile XYZ123" }];
    await analyzeGrant(llm, input, grant, "Fondazione Test", documents);
    expect(capturedHtml).toContain("Testo unico riconoscibile XYZ123");
  });

  it("falls back to the plain document when documents is omitted (backward compatible)", async () => {
    let capturedHtml = "";
    const llm: LLMProvider = {
      name: "stub",
      extract: async (args) => {
        capturedHtml = args.html;
        return validOutput;
      },
    };
    await analyzeGrant(llm, input, grant, "Fondazione Test");
    expect(capturedHtml).toBe(buildAnalysisDocument(input, grant, "Fondazione Test"));
  });
});

describe("document-length cap (spec §5 'caso limite': bandi con allegati enormi)", () => {
  it("does not truncate and reports no truncation when total document text is under the cap", () => {
    const documents: DocumentText[] = [{ title: "Piccolo.pdf", text: "x".repeat(1000) }];
    const doc = buildStrongAnalysisDocument(input, grant, null, documents);
    expect(doc).not.toContain("AVVISO");
    expect(doc).toContain("x".repeat(1000));
    expect(isDocumentTextTruncated(documents)).toBe(false);
  });

  it("truncates and appends a warning when total document text exceeds the cap", () => {
    const documents: DocumentText[] = [{ title: "Enorme.pdf", text: "x".repeat(MAX_DOCUMENT_TEXT_CHARS + 50_000) }];
    const doc = buildStrongAnalysisDocument(input, grant, null, documents);
    expect(doc).toContain("AVVISO");
    expect(doc.length).toBeLessThan(MAX_DOCUMENT_TEXT_CHARS + 5_000);
    expect(isDocumentTextTruncated(documents)).toBe(true);
  });

  it("stops including further documents once the shared budget is exhausted", () => {
    const documents: DocumentText[] = [
      { title: "Uno.pdf", text: "x".repeat(MAX_DOCUMENT_TEXT_CHARS) },
      { title: "Due.pdf", text: "testo che non dovrebbe comparire" },
    ];
    const doc = buildStrongAnalysisDocument(input, grant, null, documents);
    expect(doc).not.toContain("testo che non dovrebbe comparire");
    expect(isDocumentTextTruncated(documents)).toBe(true);
  });
});
