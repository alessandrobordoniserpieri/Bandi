// scraper/src/pipeline/economics.ts
// Shared economics extraction, used by any archetype whose amount/cofunding live in free prose
// (er-sociale, sport-governo). See ADR-009 (docs/adr/0009-shared-economics-escalation.md) for why
// this is scoped to exactly these two fields and no others.
import { parseItalianAmount } from "./enrich";
import type { JsonSchema, LLMProvider } from "../providers/types";

// Split on ". " + uppercase (not a bare "."), so Italian-formatted numbers ("20.000") never get
// split into false sentence boundaries. Shared by both anchored extractors below.
function sentences(text: string): string[] {
  return text.split(/\.\s+(?=[A-ZÀ-Ú])/);
}

// Only trusts a euro figure in the SAME sentence as a signal phrase — a bare "first mention" grabs
// unrelated figures (expense caps, per-project thresholds) that commonly appear before the real
// total in Italian bando prose. The signal regex is caller-supplied because the phrasing that
// introduces a total varies by source (er-sociale: "ammontano"/"complessivamente"/...; sport-governo:
// "finanziata con"/"stanziato"/...).
export function extractAnchoredAmount(text: string, signalRe: RegExp): number | null {
  for (const sentence of sentences(text)) {
    if (signalRe.test(sentence)) {
      const n = parseItalianAmount(sentence);
      if (n != null) return n;
    }
  }
  return null;
}

// Cofunding-percentage anchor words are generic Italian grant-bureaucracy terminology (not
// source-specific like the amount signal), so this is one shared default rather than a
// per-archetype constant.
export const COFUNDING_SIGNAL_RE = /cofinanziamento|compartecipazione|quota/i;

const PERCENT_TOKEN_RE = /([0-9]+(?:[.,][0-9]+)?)\s*(?:%|per\s*cento)/i;

export function extractAnchoredPercentage(text: string, signalRe: RegExp): number | null {
  for (const sentence of sentences(text)) {
    if (signalRe.test(sentence)) {
      const m = PERCENT_TOKEN_RE.exec(sentence);
      if (m) {
        const n = Number(m[1]!.replace(",", "."));
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

export interface EconomicsResult { amount: number | null; cofundingPercentage: number | null; }

const ECONOMICS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    totalAmount: { type: "string", nullable: true },
    cofundingPercentage: { type: "string", nullable: true },
  },
  required: [],
};

const ECONOMICS_INSTRUCTIONS = [
  "Il testo è la descrizione completa di un bando di finanziamento pubblico italiano.",
  "Estrai due valori indipendenti, se presenti chiaramente nel testo:",
  "1) totalAmount: SOLO l'importo TOTALE complessivamente disponibile per il bando (il fondo nel suo insieme).",
  "IGNORA per totalAmount: limiti di spesa per singola voce, soglie minime o massime per singolo progetto, percentuali.",
  "2) cofundingPercentage: la percentuale di COFINANZIAMENTO/COMPARTECIPAZIONE richiesta al beneficiario (es. '15' per '15%').",
  "NON confondere cofundingPercentage con altre percentuali (es. un credito d'imposta, un tasso di interesse): deve essere esplicitamente legata a cofinanziamento/compartecipazione/quota a carico del beneficiario.",
  "Se un valore non è chiaramente indicato, restituisci null per quel campo. Non sommare cifre né indovinare.",
].join(" ");

// totalAmount is a string WE prompt an LLM to produce, not free Italian prose scraped from a
// page — parseItalianAmount (enrich.ts) assumes every "." is a thousands separator, which is only
// true for genuine Italian-formatted text. Gemini does not reliably follow one convention here:
// verified live (regione.emilia-romagna.it/sport/bandi, 2026-07-20) the SAME field comes back as
// "1.000.000" (Italian, no decimals), "1.000.000,00" (Italian, with decimals), "546700" (plain
// digits), AND "150000.00" (decimal-point, no grouping) — the last kind was silently inflated
// 100x by parseItalianAmount (a real €150.000 bando got saved as 15.000.000). Distinguish by
// trailing separator width: a real Italian thousands group is always exactly 3 digits; a decimal
// fraction is 1-2. Only the LAST separator's width decides — earlier ones are always grouping.
function parseLlmAmount(raw: string): number | null {
  const cleaned = raw.replace(/[€\s]/g, "");
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;
  const decimalTail = /^([\d.,]*\d)[.,](\d{1,2})$/.exec(cleaned);
  const normalized = decimalTail
    ? `${decimalTail[1]!.replace(/[.,]/g, "")}.${decimalTail[2]}`
    : cleaned.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Last resort: called only when the deterministic tiers left `amount` unresolved (see each
// archetype's call site — the trigger is amount alone, never cofunding alone, to keep this call
// rare). Resolves both fields in the SAME call so a rare escalation isn't wasted on one field.
// Never throws: any failure (provider error, unusable response) yields nulls, retried next run.
export async function escalateEconomicsToLLM(text: string, llm: LLMProvider): Promise<EconomicsResult> {
  if (!text) return { amount: null, cofundingPercentage: null };
  try {
    let out: unknown = await llm.extract({ html: text, schema: ECONOMICS_SCHEMA, instructions: ECONOMICS_INSTRUCTIONS });
    if (typeof out === "string") { try { out = JSON.parse(out); } catch { return { amount: null, cofundingPercentage: null }; } }
    const o = out as { totalAmount?: unknown; cofundingPercentage?: unknown } | null;
    const amount = typeof o?.totalAmount === "string" ? parseLlmAmount(o.totalAmount) : null;
    const cofundingPercentage = typeof o?.cofundingPercentage === "string"
      ? Number(o.cofundingPercentage.replace(",", ".").replace("%", "").trim())
      : null;
    return {
      amount,
      cofundingPercentage: cofundingPercentage != null && Number.isFinite(cofundingPercentage) ? cofundingPercentage : null,
    };
  } catch {
    return { amount: null, cofundingPercentage: null };
  }
}
