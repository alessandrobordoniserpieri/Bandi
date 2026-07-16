// scraper/src/pipeline/archetypes.ts
import type { Archetype } from "./types";
import type { JsonSchema } from "../providers/types";
import { sanitizeHtml } from "./sanitize-html";
import { FULL_ARCHETYPE } from "./extract-grants";
import { ER_SOCIALE_ARCHETYPE } from "./er-sociale";

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
  detailEnabled: true,
};

// Archetype "sportesalute" — Sport e Salute "bandi altri enti" (an SP Page Builder card grid).
// The listing carries ~220 cards, each with a title, an EXTERNAL "Scopri di più" link, a region
// label and a labeled info block (Termine / Ente promotore / Destinatari / Risorse). The page is
// fully server-rendered and perfectly regular, so this archetype PARSES it in code (parse() below)
// and never calls the LLM — deterministic, instant, and free. The sanitize + trimmed schema below
// exist only as an LLM fallback if parse() ever returns [] (e.g. the site is redesigned): it
// pre-digests each card into a compact <li>, dropping the description prose that otherwise bloats
// the payload past Gemini's per-call timeout. detailEnabled is false: each card links to a
// different external site, so per-grant detail fetching is pointless.
const stripTags = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Decode the handful of entities that survive into card text, so stored fields are clean.
const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&quot;": '"', "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘",
  "&ldquo;": "“", "&rdquo;": "”", "&laquo;": "«", "&raquo;": "»",
  "&ndash;": "–", "&mdash;": "—", "&agrave;": "à", "&egrave;": "è", "&eacute;": "é",
  "&igrave;": "ì", "&ograve;": "ò", "&ugrave;": "ù", "&Agrave;": "À", "&Egrave;": "È",
};
const clean = (s: string): string =>
  decodeEntities(stripTags(s));
function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-zA-Z]+;/g, (e) => ENTITIES[e] ?? e);
}

interface SesCard { title: string; url: string; region: string; info: string; }

// Shared card extractor for both the parser and the fallback sanitize. Each card is a
// <div class="sppb-addon-image-layouts"> with a title_card heading, an external "button" link, a
// region label, and a labeled info paragraph starting at "Termine di presentazione domanda:".
function extractSesCards(raw: string): SesCard[] {
  const mStart = raw.indexOf("<main");
  const mEnd = raw.indexOf("</main>");
  const main = mStart >= 0 && mEnd > mStart ? raw.slice(mStart, mEnd) : raw;
  const cards: SesCard[] = [];
  for (const seg of main.split('<div class="sppb-addon-image-layouts"').slice(1)) {
    const titleRaw = /title_card[^>]*>([\s\S]*?)<\/h5>/i.exec(seg)?.[1];
    const url = /href="([^"]+)"[^>]*class="button/i.exec(seg)?.[1];
    if (!titleRaw || !url) continue;
    const title = clean(titleRaw);
    if (!title) continue;
    const region = /regione-bando[^>]*>([^<]+)</i.exec(seg)?.[1];
    const info = /<p>\s*<strong>[^<]*Termine[\s\S]*?<\/p>/i.exec(seg)?.[0];
    cards.push({ title, url, region: region ? clean(region) : "", info: info ? clean(info) : "" });
  }
  return cards;
}

// A card's info paragraph is "Termine …: <v> Ente promotore: <v> Destinatari: <v> Risorse: <v>".
// Each value runs from its label up to whichever other label comes next (or the end); an empty
// field (e.g. a trailing "Risorse:" with nothing after) yields "".
const CARD_LABELS = ["Termine di presentazione domanda:", "Ente promotore:", "Destinatari:", "Risorse:"];
function fieldAfter(info: string, label: string): string {
  const start = info.indexOf(label);
  if (start < 0) return "";
  const from = start + label.length;
  let end = info.length;
  for (const other of CARD_LABELS) {
    if (other === label) continue;
    const i = info.indexOf(other, from);
    if (i >= 0 && i < end) end = i;
  }
  return info.slice(from, end).trim();
}

// "15/07/2026" (or "1/9/2026") → ISO "2026-07-15"; anything else → null (coerce rejects non-ISO).
function isoFromItalianDate(s: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

// beneficiaries → eligibleTypes: keyword rules tested as substrings against the whole beneficiaries
// string (not a comma-split — free-text tails like "Micro, Piccole e Medie imprese del territorio di
// Parma, Piacenza..." use commas mid-phrase, so splitting on them would produce garbage atoms).
// "Altri soggetti" means "anyone else too" — when present the grant is de facto open to everyone,
// so it short-circuits to [] regardless of what other categories are listed alongside it (design
// doc: docs/superpowers/specs/2026-07-16-sportesalute-vocab-transcoding-design.md).
const ALTRI_SOGGETTI_RE = /altri soggetti/i;

const ELIGIBLE_TYPE_RULES: ReadonlyArray<{ re: RegExp; types: readonly string[] }> = [
  { re: /organismi sportivi/i, types: [
    "EPS - Ente di Promozione Sportiva", "FSN - Federazione Sportiva Nazionale",
    "DSA - Disciplina Sportiva Associata", "AB - Associazione Benemerita",
    "Comitato territoriale EPS/FSN",
  ] },
  { re: /società e associazioni sportive|associazioni sportive/i, types: [
    "ASD - Associazione Sportiva Dilettantistica", "SSD - Società Sportiva Dilettantistica",
    "SSD a r.l. - Società Sportiva Dilettantistica a responsabilità limitata",
    "ASD/SSD iscritta RASD",
  ] },
  { re: /enti del terzo settore|terzo settore/i, types: [
    "APS - Associazione di Promozione Sociale", "ODV - Organizzazione di Volontariato",
    "ETS - Ente del Terzo Settore", "Rete associativa ETS", "ONLUS", "ONG / OSC",
  ] },
  { re: /imprese|impresa/i, types: ["Impresa", "PMI", "Start-up innovativa", "Società benefit"] },
  { re: /comuni|comune/i, types: ["Comune", "Unione di Comuni"] },
  { re: /regioni|regione/i, types: ["Regione"] },
  { re: /provinc|città metropolitan/i, types: ["Provincia / Città Metropolitana"] },
  { re: /enti pubblici|ente pubblico/i, types: ["Ente pubblico"] },
];

function deriveEligibleTypes(beneficiaries: string | null): string[] {
  if (!beneficiaries || ALTRI_SOGGETTI_RE.test(beneficiaries)) return [];
  const out = new Set<string>();
  for (const rule of ELIGIBLE_TYPE_RULES) {
    if (rule.re.test(beneficiaries)) for (const t of rule.types) out.add(t);
  }
  return [...out];
}

// title → tags: same keyword-substring approach, tested against the card title. "sport" is always
// included (the entire source is Sport e Salute), so — unlike eligibleTypes — this never returns [].
const TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /impiant[oi] sportiv|palestr|palazzett|piscin|campo (da calcio|di bocce)|struttura sportiva|centro sportivo|complesso sportivo/i, tag: "impianti sportivi" },
  { re: /scuola|scolastic/i, tag: "scuola" },
  { re: /minori/i, tag: "minori" },
  { re: /giovani/i, tag: "giovani" },
  { re: /turis|ricreativ/i, tag: "turismo" },
  { re: /centri estivi|centro estivo/i, tag: "centri estivi" },
  { re: /disabil/i, tag: "disabilità" },
  { re: /anzian/i, tag: "anziani" },
  { re: /volontariat/i, tag: "volontariato" },
];

function deriveTags(title: string): string[] {
  const out = new Set<string>(["sport"]);
  for (const rule of TAG_RULES) {
    if (rule.re.test(title)) out.add(rule.tag);
  }
  return [...out];
}

// PRIMARY path: parse each card straight into a raw grant item — no LLM. amount stays a string
// ("Euro 900.000"); coerce's numOrNull parses it via parseItalianAmount downstream. eligibleTypes/
// tags are derived here too; coerce() validates both against LEGAL_TYPE_SET/TAG_SET unchanged.
function parseSportesalute(raw: string): unknown[] {
  return extractSesCards(raw).map((c) => {
    const beneficiaries = fieldAfter(c.info, "Destinatari:") || null;
    return {
      title: c.title,
      url: c.url,
      deadline: isoFromItalianDate(fieldAfter(c.info, "Termine di presentazione domanda:")),
      amount: fieldAfter(c.info, "Risorse:") || null,
      beneficiaries,
      area: c.region || null,
      eligibleTypes: deriveEligibleTypes(beneficiaries),
      tags: deriveTags(c.title),
    };
  });
}

// FALLBACK sanitize (used only if parse() returns []): compact each card into one <li> for the LLM.
function sanitizeSportesalute(raw: string): string {
  const cards = extractSesCards(raw);
  if (!cards.length) return sanitizeHtml(raw);
  const lis = cards.map((c) =>
    `<li><a href="${c.url}">${c.title}</a> ${c.region ? `Regione: ${c.region}.` : ""} ${c.info}</li>`);
  return `<ul>${lis.join("")}</ul>`;
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
      area: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const SPORTESALUTE_INSTRUCTIONS = [
  "Sei un assistente che estrae bandi da un elenco italiano GIÀ ripulito: ogni <li> è un bando indipendente.",
  "Non attribuire mai a un bando campi che appartengono a un altro <li>.",
  "Per ogni <li>: title = testo del link, url = href del link (copialo ESATTO, non modificarlo).",
  "deadline = la data dopo 'Termine di presentazione domanda:', convertita in ISO YYYY-MM-DD.",
  "amount = il valore dopo 'Risorse:'; beneficiaries = il testo dopo 'Destinatari:'; area = la regione dopo 'Regione:'.",
  "Se dopo un'etichetta non c'è testo, o un campo non è presente, usa null. Non inventare valori.",
].join(" ");

const SPORTESALUTE_ARCHETYPE: Archetype = {
  name: "sportesalute",
  parse: parseSportesalute, // primary path — no LLM
  sanitize: sanitizeSportesalute, // LLM fallback only
  chunkSize: 15_000,
  overlap: 0,
  boundaryTags: ["</li>"],
  urlSnapping: true,
  listing: { schema: SPORTESALUTE_SCHEMA, instructions: SPORTESALUTE_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: false,
};

// The registry. Add a new archetype here (and give it a scrape_config.archetype key) rather than
// forking the orchestrator. The key lives in the DB; the strategy lives in code (like AI_PROVIDER).
export const ARCHETYPES: Record<string, Archetype> = {
  [FULL_ARCHETYPE.name]: FULL_ARCHETYPE,
  [LISTING_LIGHT_ARCHETYPE.name]: LISTING_LIGHT_ARCHETYPE,
  [SPORTESALUTE_ARCHETYPE.name]: SPORTESALUTE_ARCHETYPE,
  [ER_SOCIALE_ARCHETYPE.name]: ER_SOCIALE_ARCHETYPE,
};

export const DEFAULT_ARCHETYPE = FULL_ARCHETYPE;

// Resolves a scrape_config.archetype key to its strategy. Unknown/missing keys fall back to the
// default ("full") so a typo or an un-migrated source degrades to today's behavior, never crashes.
export function resolveArchetype(key: string | undefined): Archetype {
  if (key && key in ARCHETYPES) return ARCHETYPES[key]!;
  if (key) console.warn(`[archetypes] unknown archetype "${key}", falling back to "${DEFAULT_ARCHETYPE.name}"`);
  return DEFAULT_ARCHETYPE;
}
