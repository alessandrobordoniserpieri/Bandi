// scraper/src/pipeline/extract-grants.ts
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { ExtractedGrant, GrantsDb, RawPage } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, GEO_SCOPES, COMPLEXITY, GRANT_STATUS } from "./vocab";
import type { GeoScope, Complexity, GrantStatus } from "./vocab";
import { parseItalianAmount } from "./enrich";
import { sanitizeHtml } from "./sanitize-html";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// DISCOVERY schema. Phase 1 only finds grants (name + link + deadline); the ~16 rich fields
// are extracted later, per-grant, by the detail phase (extract-detail.ts). Keeping this lean
// slashes output tokens (a listing page can hold 200+ grants) and removes any need to chunk a
// page just to fit the response under the model's output cap.
//
// Gemini's response_schema (a restricted OpenAPI-3.0 subset, not full JSON Schema) rejects
// `type` as an array — "type": ["string", "null"] fails with HTTP 400 on every nullable field,
// swallowed as "no grants". Nullable fields use `nullable: true` alongside a single `type`.
export const GRANT_JSON_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

// Instructions carry the current date so the model can drop grants whose deadline has passed —
// on real pages most closures are date-based, not a "chiuso/scaduto" word. Both signals are
// handled: sanitizeHtml preserves the status words, and `today` lets the model compare deadlines.
export function buildExtractInstructions(today: string): string {
  return [
    "Sei un assistente che TROVA i bandi di finanziamento elencati in una pagina web italiana.",
    "Questa è la FASE DI SCOPERTA. Per ogni bando restituisci SOLO tre campi:",
    "title (il nome del bando), url (il link alla sua pagina di dettaglio), deadline (scadenza in formato ISO YYYY-MM-DD, oppure null).",
    "NON estrarre altri campi: importi, requisiti, destinatari e simili verranno raccolti in una fase successiva.",
    `OGGI è ${today}.`,
    "Escludi COMPLETAMENTE dall'array i bandi non più aperti: se un bando è marcato \"chiuso\", \"scaduto\", \"terminato\", \"concluso\" o \"archiviato\", oppure ha una scadenza precedente a OGGI, NON includerlo. Nel dubbio sullo stato, includilo.",
    "Non inventare valori. Copia gli URL esattamente come appaiono negli href della pagina, senza tradurre o modificare nessuna parola.",
    "Se una voce è troncata o incompleta (senza nome chiaro o senza link), NON includerla.",
  ].join(" ");
}

// Backward-compatible default (date resolved at module load); extractGrants rebuilds it per run.
export const EXTRACT_INSTRUCTIONS = buildExtractInstructions(new Date().toISOString().slice(0, 10));

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

const HREF_RE = /href\s*=\s*"([^"]+)"/gi;

function collectHrefs(html: string): Set<string> {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = m[1];
    if (href && isValidHttpUrl(href)) set.add(href);
  }
  return set;
}

function charDist(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}

function snapToHref(url: string, hrefs: Set<string>): string | null {
  if (hrefs.has(url)) return url;
  if (hrefs.size === 0) return null;
  let bestHref: string | null = null;
  let bestDist = Infinity;
  let urlHost: string;
  try { urlHost = new URL(url).hostname; } catch { return null; }
  for (const href of hrefs) {
    try { if (new URL(href).hostname !== urlHost) continue; } catch { continue; }
    const d = charDist(url, href);
    if (d < bestDist) { bestDist = d; bestHref = href; }
  }
  return bestHref;
}

function resolveUrl(raw: string, pageUrl: string): string | null {
  if (isValidHttpUrl(raw)) return raw;
  try { return new URL(raw, pageUrl).href; } catch { return null; }
}

function coerce(raw: unknown, sourceId: string, pageUrl: string): Omit<ExtractedGrant, "providerId"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = stringOrNull(o.title);
  const rawUrl = stringOrNull(o.url);
  if (!title || !rawUrl) return null;
  const url = resolveUrl(rawUrl, pageUrl);
  if (!url) return null;

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

const CHUNK_SIZE = 35_000;
const OVERLAP = 5_000;

// Prefer semantic boundaries (</h2>, </li>, </tr>, </p>, </table>) so a grant is never split
// mid-record. Fallback to the last space, then a hard cut, so we always make progress.
const BOUNDARY_TAGS = ["</h2>", "</h3>", "</table>", "</tr>", "</li>", "</p>"];

function findBoundary(text: string, from: number, to: number): number {
  for (const tag of BOUNDARY_TAGS) {
    const idx = text.lastIndexOf(tag, to);
    if (idx > from) return idx + tag.length;
  }
  const space = text.lastIndexOf(" ", to);
  return space > from ? space : to;
}

function splitIntoChunks(text: string, maxLen: number, overlap: number = OVERLAP): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = start + maxLen;
    const end = hardEnd >= text.length ? text.length : findBoundary(text, start, hardEnd);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    const step = end - overlap;
    start = step > start ? step : end;
  }
  return chunks;
}

async function extractFromChunks(
  chunks: string[],
  llm: LLMProvider,
  pageUrl: string,
  instructions: string,
): Promise<unknown[]> {
  const allItems: unknown[] = [];
  for (const chunk of chunks) {
    try {
      let raw: unknown = await llm.extract({
        html: chunk, schema: GRANT_JSON_SCHEMA, instructions,
      });
      if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { continue; } }
      if (isUnknownArray(raw)) allItems.push(...raw);
    } catch (err) {
      console.error(`[extractGrants] LLM error for ${pageUrl} (chunk):`, err instanceof Error ? err.message : err);
    }
  }
  return allItems;
}

export async function extractGrants(
  page: RawPage, deps: { llm: LLMProvider; db: GrantsDb },
): Promise<ExtractedGrant[]> {
  const cleaned = sanitizeHtml(page.html);
  const hrefs = collectHrefs(cleaned);
  const chunks = splitIntoChunks(cleaned, CHUNK_SIZE);
  const instructions = buildExtractInstructions(new Date().toISOString().slice(0, 10));

  console.log(`[extractGrants] ${page.url}: ${cleaned.length} chars, ${chunks.length} chunk(s), ${hrefs.size} hrefs`);

  const rawItems = await extractFromChunks(chunks, deps.llm, page.url, instructions);
  if (rawItems.length === 0) return [];

  console.log(`[extractGrants] ${page.url}: LLM returned ${rawItems.length} items total`);
  const byUrl = new Map<string, { grant: ExtractedGrant; item: unknown }>();
  for (const item of rawItems) {
    const coerced = coerce(item, page.sourceId, page.url);
    if (!coerced) {
      const o = item as Record<string, unknown>;
      console.warn(`[extractGrants] coerce rejected: title=${o?.title} url=${o?.url}`);
      continue;
    }
    const snapped = snapToHref(coerced.url, hrefs);
    if (snapped) coerced.url = snapped;
    const providerId = await resolveProviderId(item, deps.db);
    const next: ExtractedGrant = { ...coerced, providerId };
    const prev = byUrl.get(next.url);
    byUrl.set(next.url, { grant: prev ? mergeGrants(prev.grant, next) : next, item });
  }
  return [...byUrl.values()].map((v) => v.grant);
}

// Overlapping chunks can produce the same grant twice with different fields populated
// (chunk1 has title+url, chunk2 has amount+deadline). Merge takes each non-empty field
// from either side, preferring the existing one when both are populated — first-seen wins,
// so the version with more complete surrounding context is kept.
function mergeGrants(a: ExtractedGrant, b: ExtractedGrant): ExtractedGrant {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof ExtractedGrant)[]) {
    if (isEmpty(out[k]) && !isEmpty(b[k])) {
      (out as Record<string, unknown>)[k] = b[k];
    }
  }
  return out;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
