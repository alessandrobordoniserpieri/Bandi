// scraper/src/pipeline/extract-detail.ts
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { DetailGrant } from "./types";
import type { FundingType } from "./vocab";
import { TAG_SET, LEGAL_TYPE_SET, FUNDING_TYPES } from "./vocab";
import { parseItalianAmount } from "./enrich";
import { sanitizeHtml } from "./sanitize-html";
import { deriveRequiredDocuments } from "./documents";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DETAIL_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", nullable: true },
    requirements: { type: "string", nullable: true },
    beneficiaries: { type: "string", nullable: true },
    openingDate: { type: "string", nullable: true },
    fundingType: { type: "string", nullable: true },
    amount: { type: "string", nullable: true },
    minAmount: { type: "string", nullable: true },
    maxAmount: { type: "string", nullable: true },
    cofundingPercentage: { type: "string", nullable: true },
    eligibleExpenses: { type: "string", nullable: true },
    applicationMethod: { type: "string", nullable: true },
    contactInfo: { type: "string", nullable: true },
    deadline: { type: "string", nullable: true },
    eligibleTypes: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
  },
  required: [],
};

export const DETAIL_INSTRUCTIONS = [
  "Sei un assistente che estrae informazioni dettagliate da una pagina di un singolo bando di finanziamento italiano.",
  "Restituisci un oggetto JSON con i campi dello schema.",
  "summary: riassunto del bando in 2-3 frasi.",
  "requirements: requisiti di ammissibilità per i candidati.",
  "beneficiaries: soggetti destinatari del bando.",
  "openingDate: data di apertura del bando (YYYY-MM-DD).",
  "fundingType: uno tra fondo_perduto, prestito_agevolato, contributo_misto, garanzia, premio.",
  "amount: importo totale del fondo o importo massimo per progetto.",
  "minAmount: importo minimo per progetto, se specificato.",
  "maxAmount: importo massimo per progetto, se specificato.",
  "cofundingPercentage: percentuale di cofinanziamento richiesta (solo il numero, es. 20 per 20%).",
  "eligibleExpenses: descrizione delle spese ammissibili.",
  "applicationMethod: modalità di presentazione della domanda.",
  "contactInfo: contatti, email, telefono per informazioni.",
  "deadline: scadenza del bando (YYYY-MM-DD).",
  "eligibleTypes: tipologie di enti ammissibili.",
  "tags: argomenti tematici del bando.",
  "Usa null quando un campo non è presente. Non inventare valori.",
].join(" ");

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseItalianAmount(v);
  return null;
}

function percentOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return n >= 0 && n <= 100 ? n : null;
}

export async function extractDetail(
  html: string,
  llm: LLMProvider,
): Promise<DetailGrant | null> {
  let raw: unknown;
  try {
    raw = await llm.extract({ html: sanitizeHtml(html), schema: DETAIL_JSON_SCHEMA, instructions: DETAIL_INSTRUCTIONS });
  } catch {
    return null;
  }
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return null; } }
  if (typeof raw !== "object" || raw === null) return null;

  const o = raw as Record<string, unknown>;

  const deadlineRaw = stringOrNull(o.deadline);
  const openingRaw = stringOrNull(o.openingDate);
  const fundingRaw = stringOrNull(o.fundingType);
  const requirements = stringOrNull(o.requirements);

  return {
    summary: stringOrNull(o.summary),
    requirements,
    beneficiaries: stringOrNull(o.beneficiaries),
    openingDate: openingRaw && ISO_DATE.test(openingRaw) ? openingRaw : null,
    fundingType: fundingRaw && (FUNDING_TYPES as readonly string[]).includes(fundingRaw)
      ? (fundingRaw as FundingType) : null,
    amount: numOrNull(o.amount),
    minAmount: numOrNull(o.minAmount),
    maxAmount: numOrNull(o.maxAmount),
    cofundingPercentage: percentOrNull(o.cofundingPercentage),
    eligibleExpenses: stringOrNull(o.eligibleExpenses),
    applicationMethod: stringOrNull(o.applicationMethod),
    contactInfo: stringOrNull(o.contactInfo),
    deadline: deadlineRaw && ISO_DATE.test(deadlineRaw) ? deadlineRaw : null,
    eligibleTypes: stringArray(o.eligibleTypes).filter((t) => LEGAL_TYPE_SET.has(t)),
    tags: stringArray(o.tags).filter((t) => TAG_SET.has(t)),
    // Derived from the same prose fields the model returned (title/summary/requirements/beneficiaries):
    // the checklist keywords live in the requirements text, not in a dedicated schema field.
    requiredDocuments: deriveRequiredDocuments(
      [stringOrNull(o.summary), requirements, stringOrNull(o.beneficiaries)].filter(Boolean).join(" "),
    ),
    // The LLM path never invents attachment URLs; only code parsers (parseDetail) supply them.
    attachments: [],
  };
}
