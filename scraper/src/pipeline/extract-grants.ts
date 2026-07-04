// scraper/src/pipeline/extract-grants.ts
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { ExtractedGrant, GrantsDb, RawPage } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, GEO_SCOPES, COMPLEXITY, GRANT_STATUS } from "./vocab";

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

function coerce(raw: unknown, providerId: string | null): ExtractedGrant | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = stringOrNull(o.title);
  const url = stringOrNull(o.url);
  if (!title || !url) return null;

  const deadlineRaw = stringOrNull(o.deadline);
  const deadline = deadlineRaw && ISO_DATE.test(deadlineRaw) ? deadlineRaw : null;
  const statusRaw = stringOrNull(o.status);
  const status = statusRaw && (GRANT_STATUS as readonly string[]).includes(statusRaw)
    ? (statusRaw as ExtractedGrant["status"]) : null;
  const geoRaw = stringOrNull(o.geoScope);
  const geoScope = geoRaw && (GEO_SCOPES as readonly string[]).includes(geoRaw)
    ? (geoRaw as ExtractedGrant["geoScope"]) : null;
  const complexityRaw = stringOrNull(o.complexity);
  const complexity = complexityRaw && (COMPLEXITY as readonly string[]).includes(complexityRaw)
    ? (complexityRaw as ExtractedGrant["complexity"]) : null;

  return {
    title, url, providerId, deadline, status,
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
  if (!Array.isArray(raw)) return [];

  const out: ExtractedGrant[] = [];
  for (const item of raw) {
    const name = typeof item === "object" && item !== null
      ? stringOrNull((item as Record<string, unknown>).providerName) : null;
    const providerId = name ? await deps.db.findProviderIdByName(name) : null;
    const grant = coerce(item, providerId);
    if (grant) out.push(grant);
  }
  return out;
}
