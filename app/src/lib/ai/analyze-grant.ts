// app/src/lib/ai/analyze-grant.ts
// On-demand profile×grant analysis (§8). The provider's output is NEVER rendered raw: it is
// parsed and validated against `analysisSchema`; anything malformed throws and the route maps
// it to an Italian error.
import { z } from "zod";
import type { LLMProvider, JsonSchema } from "./provider";
import type { EntityProfile, Grant } from "@/lib/matching";

const item = z.string().trim().min(1).max(600);
const section = z.array(item).max(10).default([]);

export const analysisSchema = z.object({
  punti_di_forza: section,
  rischi: section,
  suggerimenti: section,
  passi_successivi: section,
});

export interface GrantAnalysis {
  puntiDiForza: string[];
  rischi: string[];
  suggerimenti: string[];
  passiSuccessivi: string[];
}

const ANALYSIS_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    punti_di_forza: { type: "array", items: { type: "string" } },
    rischi: { type: "array", items: { type: "string" } },
    suggerimenti: { type: "array", items: { type: "string" } },
    passi_successivi: { type: "array", items: { type: "string" } },
  },
  required: ["punti_di_forza", "rischi", "suggerimenti", "passi_successivi"],
};

export const ANALYSIS_INSTRUCTIONS = [
  "Sei un consulente esperto di bandi per il Terzo Settore italiano (D.Lgs 117/2017).",
  "Riceverai il profilo di un ente e i dati di un bando.",
  "Produci un'analisi personalizzata in italiano, citando elementi concreti del profilo",
  "(forma giuridica, territorio, temi, esperienza) e del bando — niente frasi generiche.",
  "Rispondi SOLO con un oggetto JSON con le chiavi: punti_di_forza, rischi, suggerimenti,",
  "passi_successivi — ognuna un array di frasi brevi in italiano (2-5 voci per chiave).",
].join(" ");

export interface AnalysisProfileInput {
  profile: EntityProfile;
  name: string | null;
  activityDescription: string | null;
}

// The "document" handed to the provider through the seam's `html` field: a structured
// Italian text block with the profile and the grant's 16 fields.
export function buildAnalysisDocument(
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
): string {
  const p = input.profile;
  const funded = p.projectHistory.filter((r) => r.outcome === "finanziato").length;
  const lines = [
    "== PROFILO ENTE ==",
    `Nome: ${input.name ?? "n/d"}`,
    `Forma giuridica: ${p.legalType}`,
    `Territorio: provincia ${p.province}, regione ${p.region}` +
      (p.operatingProvinces.length ? `, opera anche in: ${p.operatingProvinces.join(", ")}` : ""),
    `Temi: ${p.themes.join(", ") || "n/d"}`,
    `Attività: ${input.activityDescription ?? "n/d"}`,
    `Progetti finanziati in passato: ${funded}`,
    `Tipologie di fondi già ricevute: ${p.fundingTypesReceived.join(", ") || "nessuna"}`,
    `Capacità di cofinanziamento: ${p.cofundingCapacity != null ? `${p.cofundingCapacity}%` : "n/d"}`,
    `Documenti disponibili: ${Object.entries(p.documents).filter(([, v]) => v).map(([k]) => k).join(", ") || "nessuno"}`,
    "",
    "== BANDO ==",
    `Titolo: ${grant.title}`,
    `Erogatore: ${providerName ?? "n/d"} (${grant.providerKind ?? "n/d"})`,
    `Scadenza: ${grant.deadline ?? "n/d"} — Stato: ${grant.status}`,
    `Importo: ${grant.amount != null ? `€ ${grant.amount}` : "n/d"}` +
      (grant.minAmount != null || grant.maxAmount != null ? ` (min: ${grant.minAmount != null ? `€ ${grant.minAmount}` : "n/d"}, max: ${grant.maxAmount != null ? `€ ${grant.maxAmount}` : "n/d"})` : "") +
      ` — Cofinanziamento: ${grant.cofundingPercentage != null ? `${grant.cofundingPercentage}%` : "n/d"}` +
      (grant.cofundingRequired != null ? ` (€ ${grant.cofundingRequired})` : ""),
    `Tipo finanziamento: ${grant.fundingType ?? "n/d"}`,
    `Forme giuridiche ammesse: ${grant.eligibleTypes.join(", ") || "n/d"}`,
    `Temi del bando: ${grant.tags.join(", ") || "n/d"}`,
    `Territorio: ${grant.area ?? "n/d"} (${grant.geoScope ?? "n/d"}) — Complessità: ${grant.complexity ?? "n/d"}`,
    `Documenti richiesti: ${grant.requiredDocuments.join(", ") || "n/d"}`,
    `Sintesi: ${grant.summary || "n/d"}`,
    `Requisiti: ${grant.requirements || "n/d"}`,
    `Destinatari: ${grant.beneficiaries || "n/d"}`,
  ];
  return lines.join("\n");
}

export interface DocumentText {
  title: string;
  text: string;
}

// Extends buildAnalysisDocument with the full text of the grant's PDF attachments (spec §1: same
// 4-section schema, richer input). With zero documents it's byte-identical to the plain document
// — the quick-analysis path is untouched.
export function buildStrongAnalysisDocument(
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
): string {
  const base = buildAnalysisDocument(input, grant, providerName);
  if (documents.length === 0) return base;
  const sections = documents.map((d, i) => `--- Documento ${i + 1}: ${d.title} ---\n${d.text}`);
  return [base, "", "== TESTO INTEGRALE DEI DOCUMENTI ALLEGATI ==", ...sections].join("\n");
}

export async function analyzeGrant(
  llm: LLMProvider,
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[] = [],
): Promise<GrantAnalysis> {
  const document =
    documents.length > 0
      ? buildStrongAnalysisDocument(input, grant, providerName, documents)
      : buildAnalysisDocument(input, grant, providerName);

  let raw = await llm.extract({
    html: document,
    schema: ANALYSIS_JSON_SCHEMA,
    instructions: ANALYSIS_INSTRUCTIONS,
  });
  if (typeof raw === "string") raw = JSON.parse(raw); // a malformed string throws here
  const parsed = analysisSchema.parse(raw); // malformed shape throws here

  const total =
    parsed.punti_di_forza.length + parsed.rischi.length +
    parsed.suggerimenti.length + parsed.passi_successivi.length;
  if (total === 0) throw new Error("empty analysis");

  return {
    puntiDiForza: parsed.punti_di_forza,
    rischi: parsed.rischi,
    suggerimenti: parsed.suggerimenti,
    passiSuccessivi: parsed.passi_successivi,
  };
}
