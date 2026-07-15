// scraper/src/pipeline/archetypes.ts
import type { Archetype } from "./types";
import type { JsonSchema } from "../providers/types";
import { sanitizeHtml } from "./sanitize-html";
import { FULL_ARCHETYPE } from "./extract-grants";

// Archetype "listing-light" (B): the listing page has only a title + link per grant, so extraction
// there is deliberately minimal (title, url, deadline). Everything else — amount, requirements,
// beneficiaries, ... — is left to the detail phase, which runs the same run for new grants (their
// detail_fetched_at is null). A smaller schema is faster and gives the model less room to
// hallucinate or bleed fields from an adjacent grant.
const LISTING_LIGHT_SCHEMA: JsonSchema = {
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

const LISTING_LIGHT_INSTRUCTIONS = [
  "Sei un assistente che raccoglie i link ai bandi da una pagina elenco italiana.",
  "Restituisci un array JSON: per ogni bando estrai SOLO titolo, url (l'href del link al bando) e la deadline se chiaramente visibile.",
  "NON estrarre altri dettagli (importo, requisiti, ecc.): verranno letti dalla pagina di dettaglio del singolo bando.",
  "IMPORTANTE: copia gli URL esattamente come appaiono negli href, senza tradurre o modificare nessuna parola.",
  "Se un elemento non ha un titolo chiaro o un link href, NON estrarlo.",
].join(" ");

const LISTING_LIGHT_ARCHETYPE: Archetype = {
  name: "listing-light",
  sanitize: sanitizeHtml,
  chunkSize: FULL_ARCHETYPE.chunkSize,
  overlap: FULL_ARCHETYPE.overlap,
  boundaryTags: FULL_ARCHETYPE.boundaryTags,
  urlSnapping: true,
  listing: { schema: LISTING_LIGHT_SCHEMA, instructions: LISTING_LIGHT_INSTRUCTIONS },
  detailRequired: true,
};

// Archetype "sportesalute" — Sport e Salute "bandi altri enti" (an SP Page Builder card grid).
// The listing carries ~220 rich cards, each with a title, an EXTERNAL "Scopri di più" link, and a
// labeled info block (Termine / Ente promotore / Destinatari / Risorse) plus a region label. The
// generic sanitizer leaves ~208 KB (mostly the long per-card descriptions) → 7 chunks that each
// blow Gemini's 35 s call timeout (a full-schema call on a 30 KB chunk measured ~37 s), so every
// chunk fails and the source yields 0 grants. This archetype's sanitize instead PRE-DIGESTS each
// card into a compact <li> — title link + region + the labeled info line — dropping the description
// prose and imagery. Payload roughly halves (~208 KB → ~110 KB, ~4 chunks) and, more importantly,
// the model receives clean structured text instead of messy nested HTML, so each call is far
// faster. Boundary is </li> so a card is never split; the schema is trimmed to the fields the
// compact record actually carries. detailRequired stays false: the listing already has enough to
// be useful, and the links point to ~220 different external sites (no shared detail archetype).
const stripTags = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function sanitizeSportesalute(raw: string): string {
  const mStart = raw.indexOf("<main");
  const mEnd = raw.indexOf("</main>");
  const main = mStart >= 0 && mEnd > mStart ? raw.slice(mStart, mEnd) : raw;
  const records: string[] = [];
  for (const seg of main.split('<div class="sppb-addon-image-layouts"').slice(1)) {
    const titleRaw = /title_card[^>]*>([\s\S]*?)<\/h5>/i.exec(seg)?.[1];
    const url = /href="([^"]+)"[^>]*class="button/i.exec(seg)?.[1];
    const t = titleRaw ? stripTags(titleRaw) : "";
    if (!t || !url) continue;
    const region = /regione-bando[^>]*>([^<]+)</i.exec(seg)?.[1];
    const info = /<p>\s*<strong>[^<]*Termine[\s\S]*?<\/p>/i.exec(seg)?.[0];
    const parts = [
      region ? `Regione: ${stripTags(region)}.` : "",
      info ? stripTags(info) : "",
    ].filter(Boolean).join(" ");
    records.push(`<li><a href="${url}">${t}</a> ${parts}</li>`);
  }
  // Fallback: if the card structure isn't found (page redesign), degrade to today's behaviour
  // instead of returning an empty page.
  return records.length ? `<ul>${records.join("")}</ul>` : sanitizeHtml(raw);
}

const SPORTESALUTE_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
      amount: { type: "string", nullable: true },
      beneficiaries: { type: "string", nullable: true },
      providerName: { type: "string", nullable: true },
      area: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const SPORTESALUTE_INSTRUCTIONS = [
  "Sei un assistente che estrae bandi da un elenco italiano GIÀ ripulito: ogni <li> è un bando.",
  "Per ogni <li>: title = testo del link, url = href del link (copialo ESATTO, non modificarlo).",
  "deadline = la data dopo 'Termine di presentazione domanda:', convertita in ISO YYYY-MM-DD.",
  "amount = il valore dopo 'Risorse:'; beneficiaries = il testo dopo 'Destinatari:';",
  "providerName = il testo dopo 'Ente promotore:'; area = la regione dopo 'Regione:'.",
  "Usa null quando un campo non è presente. Non inventare valori.",
].join(" ");

const SPORTESALUTE_ARCHETYPE: Archetype = {
  name: "sportesalute",
  sanitize: sanitizeSportesalute,
  // Smaller than the 35 KB default on purpose: with thinking off, extraction time is bound by the
  // JSON OUTPUT size (grants per call). A ~30 KB chunk = ~56 grants took ~48 s (over the 35 s call
  // timeout); ~15 KB = ~28 grants lands around ~25 s, safely under it. ~110 KB of cards → ~8 chunks,
  // which still fits the wall-clock budget.
  chunkSize: 15_000,
  overlap: 0, // cards are self-contained <li> and the chunker splits only on </li>, so no overlap needed
  boundaryTags: ["</li>"],
  urlSnapping: true,
  listing: { schema: SPORTESALUTE_SCHEMA, instructions: SPORTESALUTE_INSTRUCTIONS },
  detailRequired: false,
};

// The registry. Add a new archetype here (and give it a scrape_config.archetype key) rather than
// forking the orchestrator. The key lives in the DB; the strategy lives in code (like AI_PROVIDER).
export const ARCHETYPES: Record<string, Archetype> = {
  [FULL_ARCHETYPE.name]: FULL_ARCHETYPE,
  [LISTING_LIGHT_ARCHETYPE.name]: LISTING_LIGHT_ARCHETYPE,
  [SPORTESALUTE_ARCHETYPE.name]: SPORTESALUTE_ARCHETYPE,
};

export const DEFAULT_ARCHETYPE = FULL_ARCHETYPE;

// Resolves a scrape_config.archetype key to its strategy. Unknown/missing keys fall back to the
// default ("full") so a typo or an un-migrated source degrades to today's behavior, never crashes.
export function resolveArchetype(key: string | undefined): Archetype {
  if (key && key in ARCHETYPES) return ARCHETYPES[key]!;
  if (key) console.warn(`[archetypes] unknown archetype "${key}", falling back to "${DEFAULT_ARCHETYPE.name}"`);
  return DEFAULT_ARCHETYPE;
}
