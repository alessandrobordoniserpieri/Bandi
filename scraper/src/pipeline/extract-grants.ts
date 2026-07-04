// scraper/src/pipeline/extract-grants.ts
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { ExtractedGrant, GrantsDb, RawPage } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, GEO_SCOPES, COMPLEXITY, GRANT_STATUS } from "./vocab";
import type { GeoScope, Complexity, GrantStatus } from "./vocab";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The AI is asked for these keys; validation is lenient and never throws.
export const GRANT_JSON_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" }, url: { type: "string" }, providerName: { type: ["string", "null"] },
      deadline: { type: ["string", "null"] }, status: { type: ["string", "null"] },
      amount: { type: ["number", "string", "null"] }, cofundingRequired: { type: ["number", "string", "null"] },
      eligibleTypes: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      area: { type: ["string", "null"] }, geoScope: { type: ["string", "null"] },
      complexity: { type: ["string", "null"] },
      requiredDocuments: { type: "array", items: { type: "string" } },
      summary: { type: ["string", "null"] }, requirements: { type: ["string", "null"] },
      beneficiaries: { type: ["string", "null"] },
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
function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null; // string amounts are normalized later in enrich
}

function isUnknownArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

// Coerces without a provider: title/url validated up front so callers can skip
// the (async, potentially throwing) provider lookup for items that will be dropped anyway.
function coerce(raw: unknown): Omit<ExtractedGrant, "providerId"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = stringOrNull(o.title);
  const url = stringOrNull(o.url);
  if (!title || !url) return null;

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
    title, url, deadline, status,
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
    return []; // provider error → no grants from this page, pipeline continues
  }
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!isUnknownArray(raw)) return [];

  const out: ExtractedGrant[] = [];
  for (const item of raw) {
    const coerced = coerce(item);
    if (!coerced) continue; // invalid item: skip before the (async) provider lookup
    const providerId = await resolveProviderId(item, deps.db);
    out.push({ ...coerced, providerId });
  }
  return out;
}
