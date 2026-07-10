// scraper/src/pipeline/extract-grants.ts
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { ExtractedGrant, GrantsDb, RawPage } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, GEO_SCOPES, COMPLEXITY, GRANT_STATUS } from "./vocab";
import type { GeoScope, Complexity, GrantStatus } from "./vocab";
import { parseItalianAmount } from "./enrich";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The AI is asked for these keys; validation is lenient and never throws.
//
// Gemini's response_schema (a restricted OpenAPI-3.0 subset, not full JSON Schema) rejects
// `type` as an array — "type": ["string", "null"] fails with HTTP 400
// ("Proto field is not repeating, cannot start list") on every nullable field. Every extraction
// call was failing this validation and extractGrants' catch-and-return-[] swallowed it silently,
// which is indistinguishable from "the page genuinely has no grants" in the pipeline's output.
// Nullable fields use `nullable: true` alongside a single `type` instead. amount/cofundingRequired
// are declared as string (not the old number|string union) — numOrNull() already parses string
// input via parseItalianAmount, so no downstream change is needed.
export const GRANT_JSON_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" }, url: { type: "string" },
      providerName: { type: "string", nullable: true },
      deadline: { type: "string", nullable: true }, status: { type: "string", nullable: true },
      amount: { type: "string", nullable: true }, cofundingRequired: { type: "string", nullable: true },
      eligibleTypes: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      area: { type: "string", nullable: true }, geoScope: { type: "string", nullable: true },
      complexity: { type: "string", nullable: true },
      requiredDocuments: { type: "array", items: { type: "string" } },
      summary: { type: "string", nullable: true }, requirements: { type: "string", nullable: true },
      beneficiaries: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

export const EXTRACT_INSTRUCTIONS = [
  "Sei un assistente che estrae bandi di finanziamento da una pagina web italiana.",
  "Restituisci un array JSON di bandi. Per ogni bando estrai i 16 campi dello schema.",
  "Usa null quando un campo non è presente. Le date devono essere in formato ISO (YYYY-MM-DD).",
  "Non inventare valori: se non sei sicuro, usa null o ometti l'elemento dell'array.",
].join(" ");

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
// Numbers pass through; string amounts (e.g. "€ 50.000,00") are parsed via parseItalianAmount;
// anything else (including unparseable strings) becomes null.
function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseItalianAmount(v);
  return null;
}

function isUnknownArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function coerce(raw: unknown, sourceId: string): Omit<ExtractedGrant, "providerId"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = stringOrNull(o.title);
  const url = stringOrNull(o.url);
  if (!title || !url || !isValidHttpUrl(url)) return null;

  const deadlineRaw = stringOrNull(o.deadline);
  const deadline = deadlineRaw && ISO_DATE.test(deadlineRaw) ? deadlineRaw : null;
  const statusRaw = stringOrNull(o.status);
  const status = statusRaw && (GRANT_STATUS as readonly string[]).includes(statusRaw)
    ? (statusRaw as GrantStatus) : null;
  const geoRaw = stringOrNull(o.geoScope);
  const geoScope = geoRaw && (GEO_SCOPES as readonly string[]).includes(geoRaw)
    ? (geoRaw as GeoScope) : null;
  const complexityRaw = stringOrNull(o.complexity);
  const complexity = complexityRaw && (COMPLEXITY as readonly string[]).includes(complexityRaw)
    ? (complexityRaw as Complexity) : null;

  return {
    title, url, sourceId, deadline, status,
    amount: numOrNull(o.amount),
    cofundingRequired: numOrNull(o.cofundingRequired),
    eligibleTypes: stringArray(o.eligibleTypes).filter((t) => LEGAL_TYPE_SET.has(t)),
    tags: stringArray(o.tags).filter((t) => TAG_SET.has(t)),
    area: stringOrNull(o.area),
    geoScope, complexity,
    requiredDocuments: stringArray(o.requiredDocuments).filter((d) => DOCUMENT_KEY_SET.has(d)),
    summary: stringOrNull(o.summary),
    requirements: stringOrNull(o.requirements),
    beneficiaries: stringOrNull(o.beneficiaries),
    openingDate: null,
    fundingType: null,
    minAmount: null,
    maxAmount: null,
    cofundingPercentage: null,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: null,
  };
}

// Provider lookup must never break the "extractGrants never throws" contract: a production
// GrantsDb can fail on a network/DB error, in which case we keep the grant with providerId null
// rather than dropping it or letting the error propagate.
async function resolveProviderId(item: unknown, db: GrantsDb): Promise<string | null> {
  const name = typeof item === "object" && item !== null
    ? stringOrNull((item as Record<string, unknown>).providerName) : null;
  if (!name) return null;
  try {
    return await db.findProviderIdByName(name);
  } catch {
    return null;
  }
}

export async function extractGrants(
  page: RawPage, deps: { llm: LLMProvider; db: GrantsDb },
): Promise<ExtractedGrant[]> {
  let raw: unknown;
  try {
    raw = await deps.llm.extract({ html: page.html, schema: GRANT_JSON_SCHEMA, instructions: EXTRACT_INSTRUCTIONS });
  } catch {
    return [];
  }
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!isUnknownArray(raw)) return [];

  const out: ExtractedGrant[] = [];
  for (const item of raw) {
    const coerced = coerce(item, page.sourceId);
    if (!coerced) continue;
    const providerId = await resolveProviderId(item, deps.db);
    out.push({ ...coerced, providerId });
  }
  return out;
}
