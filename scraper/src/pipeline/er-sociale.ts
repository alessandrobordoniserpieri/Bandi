// scraper/src/pipeline/er-sociale.ts
// Archetype "er-sociale": Regione Emilia-Romagna "Sociale" bandi via the official Plone REST
// API. The human listing page is a ~12MB Volto app the LLM extracts almost nothing from; the
// @search endpoint (scrape_config.listUrl, fetched with fetchMode "direct") returns every Bando
// as clean JSON, and each grant's own URL returns the full object (detail phase) — so this
// archetype calls the LLM in neither phase. Design:
// docs/superpowers/specs/2026-07-16-er-sociale-api-direct-fetch-design.md
import type { Archetype } from "./types";
import type { JsonSchema } from "../providers/types";
import { TAG_SET, LEGAL_TYPE_SET } from "./vocab";

// "2025-09-30T10:00:00+00:00" (or TZ-less "2025-08-01T08:00:00") → "2025-09-30"; else null.
function isoDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
}

// destinatari/materie come as ["Enti del Terzo settore"] in @search metadata but as
// [{title, token}] in the full detail object — normalize both to plain strings.
function tokens(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (typeof e === "string" ? e : (e as { title?: unknown } | null)?.title))
    .filter((t): t is string => typeof t === "string" && t.trim() !== "");
}

// D.Lgs 117/2017: cooperative sociali, imprese sociali and fondazioni ETS ARE third-sector
// entities, so "Enti del Terzo settore" maps to the full ETS family — the narrow TERZO_SETT
// group would wrongly exclude a coop sociale from a grant open to every ETS.
const ETS_TYPES: readonly string[] = [
  "APS - Associazione di Promozione Sociale", "ODV - Organizzazione di Volontariato",
  "ETS - Ente del Terzo Settore", "Rete associativa ETS", "ONLUS", "ONG / OSC",
  "Cooperativa sociale tipo A", "Cooperativa sociale tipo B", "Consorzio di cooperative sociali",
  "Impresa sociale", "Fondazione ETS", "Società di mutuo soccorso", "Ente filantropico",
];

// "Cittadini" / "Soggetti accreditati" have no LEGAL_TYPES equivalent (individuals / too vague)
// and are deliberately unmapped: absence of a rule means no invented restriction.
const DESTINATARI_TYPES: Record<string, readonly string[]> = {
  "enti del terzo settore": ETS_TYPES,
  "enti pubblici": ["Ente pubblico"],
  "partenariato pubblico/privato": ["Raggruppamento temporaneo / ATS"],
};

function deriveEligibleTypes(destinatari: string[]): string[] {
  const out = new Set<string>();
  for (const d of destinatari) {
    for (const t of DESTINATARI_TYPES[d.trim().toLowerCase()] ?? []) out.add(t);
  }
  return [...out].filter((t) => LEGAL_TYPE_SET.has(t));
}

const MATERIE_TAGS: Record<string, string> = {
  // Blanket tag: the whole section is the region's social-policy area (the analogue of the
  // always-on "sport" in the sportesalute archetype).
  "diritti e sociale": "welfare",
  "ambiente": "ambiente",
  "cultura": "cultura",
  "sport": "sport",
};

const TEXT_TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /povert/i, tag: "contrasto povertà" },
  { re: /adolescen|giovani/i, tag: "giovani" },
  { re: /infanzia|minori/i, tag: "minori" },
  { re: /disabil/i, tag: "disabilità" },
  { re: /anzian/i, tag: "anziani" },
  { re: /volontariat/i, tag: "volontariato" },
  { re: /famigli/i, tag: "famiglie" },
  { re: /inclusion/i, tag: "inclusione" },
];

function deriveTags(materie: string[], text: string): string[] {
  const out = new Set<string>();
  for (const m of materie) {
    const tag = MATERIE_TAGS[m.trim().toLowerCase()];
    if (tag) out.add(tag);
  }
  for (const rule of TEXT_TAG_RULES) if (rule.re.test(text)) out.add(rule.tag);
  return [...out].filter((t) => TAG_SET.has(t));
}

// Best-effort amount from free text ("Con 1.000.000 euro di risorse…"): kept as the raw numeric
// string — coerce's numOrNull parses it via parseItalianAmount downstream.
function amountFrom(text: string): string | null {
  return /([\d][\d.,]*)\s*(?:euro|€)/i.exec(text)?.[1] ?? null;
}

// bando_state is ["inProgress","In corso"] / ["open","Attivo"] / ["closed","Chiuso"].
function statusFrom(v: unknown): "aperto" | "chiuso" | null {
  const token = Array.isArray(v) ? v[0] : null;
  if (token === "inProgress" || token === "open") return "aperto";
  if (token === "closed") return "chiuso";
  return null;
}

// PRIMARY listing path: parse the @search JSON straight into raw grant items — no LLM.
// Returns [] on anything unexpected, which makes extractGrants fall back to the LLM.
export function parseErSociale(raw: string): unknown[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const items = (data as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: unknown[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (o["@type"] !== "Bando") continue;
    const title = typeof o.title === "string" ? o.title : null;
    const url = typeof o["@id"] === "string" ? o["@id"] : null;
    if (!title || !url) continue;
    const description = typeof o.description === "string" ? o.description : "";
    const destinatari = tokens(o.destinatari);
    out.push({
      title,
      url,
      summary: description || null,
      deadline: isoDay(o.scadenza_bando),
      status: statusFrom(o.bando_state),
      amount: amountFrom(description),
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: destinatari.join(", ") || null,
      eligibleTypes: deriveEligibleTypes(destinatari),
      tags: deriveTags(tokens(o.materie), `${title} ${description}`),
    });
  }
  return out;
}

// LLM fallback (used only if parse() returns [], e.g. the API shape changed): the body is the
// raw @search JSON, so the instructions explain that shape instead of an HTML page.
const ER_SOCIALE_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
      summary: { type: "string", nullable: true },
      beneficiaries: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const ER_SOCIALE_INSTRUCTIONS = [
  "Il contenuto è la risposta JSON dell'API Plone @search di un sito regionale: un oggetto con un array 'items' i cui elementi con '@type' = 'Bando' sono bandi.",
  "Per ogni bando estrai: title, url (il campo '@id', copialo ESATTO), deadline (da 'scadenza_bando', solo la data YYYY-MM-DD), summary (da 'description'), beneficiaries (da 'destinatari').",
  "Ignora gli elementi con '@type' diverso da 'Bando'. Usa null per i campi mancanti. Non inventare valori.",
].join(" ");

export const ER_SOCIALE_ARCHETYPE: Archetype = {
  name: "er-sociale",
  parse: parseErSociale,             // primary path — no LLM
  sanitize: (html) => html,          // the body is JSON, not HTML — nothing to sanitize
  chunkSize: 35_000,
  overlap: 2_000,
  boundaryTags: [],                  // no HTML boundaries in JSON; whitespace fallback is fine
  urlSnapping: false,                // @id values are canonical; no hrefs exist to snap to
  listing: { schema: ER_SOCIALE_SCHEMA, instructions: ER_SOCIALE_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: true,               // each grant's URL returns the full object incl. attachments
};
