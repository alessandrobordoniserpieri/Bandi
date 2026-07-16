// scraper/src/pipeline/er-sociale.ts
// Archetype "er-sociale": Regione Emilia-Romagna "Sociale" bandi via the official Plone REST
// API. The human listing page is a ~12MB Volto app the LLM extracts almost nothing from; the
// @search endpoint (scrape_config.listUrl, fetched with fetchMode "direct") returns every Bando
// as clean JSON, and each grant's own URL returns the full object (detail phase). Listing and
// eligibility/tag transcoding are 100% code, zero LLM. The total funding amount is the one field
// that lives in free prose: extractTotalFromProse (below) resolves it deterministically for the
// phrasing this source actually uses (verified live); a targeted, single-field LLM call is the
// last resort ONLY when that finds nothing — never the general-purpose extractDetail. Design:
// docs/superpowers/specs/2026-07-16-er-sociale-api-direct-fetch-design.md
import type { Archetype, DetailGrant, GrantAttachment } from "./types";
import type { JsonSchema, LLMProvider } from "../providers/types";
import { TAG_SET, LEGAL_TYPE_SET } from "./vocab";
import { parseItalianAmount } from "./enrich";

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

// Free text often mentions OTHER unrelated euro figures before the real total (expense caps,
// min/max per-project thresholds — see the 2023 "reti associative" bando: "limite massimo di 200
// euro per le spese in contanti" appears before the real "390.000 euro" total). A bare "first
// mention" grabs the wrong one. Verified against 5 real ER Sociale bandi (2023-2026): the total is
// reliably introduced by "ammontano"/"complessivamente"/"messe a bando"/"a disposizione"/
// "destinate" in the SAME sentence — so only trust a figure anchored to one of those. Split on
// ". " + uppercase (not a bare "."), so Italian-formatted numbers ("20.000") never get split.
// "complessiv*" is intentionally NOT stemmed to a bare prefix: real bandi also use "complessivo"
// for a PER-PROJECT threshold ("Il valore minimo complessivo dei progetti... euro 10.000,00"),
// which is not the bando's total. "complessivamente"/"somma complessiva" are specific enough to
// avoid that false positive while still covering both phrasings actually seen live.
const TOTAL_SIGNAL_RE = /ammontano|complessivamente|somma complessiva|messe a bando|a disposizione|destinate/i;

export function extractTotalFromProse(text: string): number | null {
  for (const sentence of text.split(/\.\s+(?=[A-ZÀ-Ú])/)) {
    if (TOTAL_SIGNAL_RE.test(sentence)) {
      const n = parseItalianAmount(sentence);
      if (n != null) return n;
    }
  }
  return null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Status reflects whether one can still APPLY, not just the procedure lifecycle: a bando can be
// bando_state "In corso" (inProgress) while its application deadline has passed (it's in the
// esiti/results phase). A past scadenza therefore wins as "scaduto" regardless of bando_state
// (["inProgress","In corso"] / ["open","Attivo"] / ["closed","Chiuso"]).
function statusFrom(bandoState: unknown, deadline: string | null, today: string): "aperto" | "chiuso" | "scaduto" | null {
  if (deadline && deadline < today) return "scaduto";
  const token = Array.isArray(bandoState) ? bandoState[0] : null;
  if (token === "closed") return "chiuso";
  if (token === "inProgress" || token === "open") return "aperto";
  return null;
}

// PRIMARY listing path: parse the @search JSON straight into raw grant items — no LLM.
// Returns [] on anything unexpected, which makes extractGrants fall back to the LLM.
export function parseErSociale(raw: string): unknown[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const items = (data as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const today = todayIso();
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
    const deadline = isoDay(o.scadenza_bando);
    out.push({
      title,
      url,
      summary: description || null,
      deadline,
      status: statusFrom(o.bando_state, deadline, today),
      // Raw text, not a pre-extracted number: coerce()'s numOrNull runs it through the shared
      // parseItalianAmount (enrich.ts), which pulls the first currency-adjacent figure — the
      // same logic parseDetailErSociale calls directly below, kept in one place on purpose.
      amount: description || null,
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: destinatari.join(", ") || null,
      eligibleTypes: deriveEligibleTypes(destinatari),
      tags: deriveTags(tokens(o.materie), `${title} ${description}`),
    });
  }
  return out;
}

// Real bandi checked (24 live samples, 2026-07-16) run 673-10,955 chars full text; 20k is a
// generous ceiling with no observed truncation, not a tuned "safe" cap on real content.
const REQUIREMENTS_MAX_CHARS = 20_000;

type SlateNode = { type?: string; text?: string; children?: SlateNode[] };

function inlineText(node: SlateNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.children ?? []).map(inlineText).join("");
}

// This source styles subsection labels ("1 Residenzialità temporanea...") as an ordinary
// paragraph wrapped ENTIRELY in one bold run, not as a real heading block (verified live:
// value === [{type:"p", children:[{text:""},{type:"strong",children:[{text:"..."}]},{text:""}]}]).
// A paragraph that's only PARTLY bold (e.g. "...disponibili, ai sensi dell'art. 55...") must NOT
// match, so this requires the bold run to be the paragraph's one and only non-empty child.
function isFullyBoldParagraph(node: SlateNode): boolean {
  const runs = (node.children ?? []).filter((c) => inlineText(c).trim() !== "");
  return runs.length === 1 && runs[0]?.type === "strong";
}

// Volto rich text ("slate"): { blocks: {id: {plaintext, value}}, blocks_layout: {items: [ordered
// ids]} }. block.value[0].type carries real structure (h2/h3 headings, ul/ol lists, bold-only
// "subsection" paragraphs — see isFullyBoldParagraph) that plaintext alone throws away, flattening
// a structured bando into one indistinguishable wall of text. Encode that structure as a light
// heading/bullet markup ("## "/"### "/"- " line prefixes) the UI (Prose component) renders as real
// elements — fixtures/sources with no `value` field fall through to the old plain-line behavior.
function slateText(v: unknown): string | null {
  const o = v as {
    blocks?: Record<string, { plaintext?: string; value?: SlateNode[] } | undefined>;
    blocks_layout?: { items?: string[] };
  } | null;
  if (!o?.blocks) return null;
  const order = o.blocks_layout?.items ?? Object.keys(o.blocks);
  const lines: string[] = [];
  for (const id of order) {
    const block = o.blocks?.[id];
    const plaintext = (block?.plaintext ?? "").trim();
    if (!plaintext) continue;
    const node = block?.value?.[0];
    if (node?.type === "h1" || node?.type === "h2") {
      lines.push(`## ${plaintext}`);
    } else if (node?.type === "h3" || (node?.type === "p" && isFullyBoldParagraph(node))) {
      lines.push(`### ${plaintext}`);
    } else if (node?.type === "ul" || node?.type === "ol") {
      for (const item of node.children ?? []) {
        const t = inlineText(item).trim();
        if (t) lines.push(`- ${t}`);
      }
    } else {
      lines.push(plaintext);
    }
  }
  const text = lines.join("\n").trim();
  return text || null;
}

// approfondimento: [{children: [{title, url, mime_type, …}]}] — the grant's PDF attachments.
// Metadata only; children missing title or url are dropped, never half-mapped.
function attachmentsFrom(o: Record<string, unknown>): GrantAttachment[] {
  const out: GrantAttachment[] = [];
  if (!Array.isArray(o.approfondimento)) return out;
  for (const section of o.approfondimento) {
    const children = (section as { children?: unknown[] } | null)?.children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      const c = child as Record<string, unknown>;
      if (typeof c.url !== "string" || typeof c.title !== "string") continue;
      out.push({ title: c.title, url: c.url, mimeType: typeof c.mime_type === "string" ? c.mime_type : null });
    }
  }
  return out;
}

const AMOUNT_ONLY_SCHEMA: JsonSchema = {
  type: "object",
  properties: { totalAmount: { type: "string", nullable: true } },
  required: [],
};

const AMOUNT_ONLY_INSTRUCTIONS = [
  "Il testo è la descrizione completa di un bando di finanziamento pubblico italiano.",
  "Estrai SOLO l'importo TOTALE complessivamente disponibile per il bando (il fondo nel suo insieme).",
  "IGNORA: limiti di spesa per singola voce (es. 'limite di 200 euro per le spese in contanti'), soglie minime o massime per singolo progetto (es. 'importo minimo 20.000 euro', 'contributo massimo 50.000 euro'), percentuali di cofinanziamento.",
  "Se il testo non indica un unico importo totale complessivo chiaro, restituisci null. Non sommare cifre né indovinare.",
].join(" ");

// Last resort: reached only when NEITHER deterministic pass (below) finds a total — rare (0/5
// real bandi checked needed it). One narrowly-scoped field, one plaintext body (a few KB, not the
// raw page), never the general-purpose extractDetail schema. Never throws: any failure (provider
// error, unusable response) is null, same as the deterministic path — retried fresh next run.
async function escalateAmountToLLM(text: string, llm: LLMProvider): Promise<number | null> {
  if (!text) return null;
  try {
    let out: unknown = await llm.extract({ html: text, schema: AMOUNT_ONLY_SCHEMA, instructions: AMOUNT_ONLY_INSTRUCTIONS });
    if (typeof out === "string") { try { out = JSON.parse(out); } catch { return null; } }
    const totalAmount = (out as { totalAmount?: unknown } | null)?.totalAmount;
    return typeof totalAmount === "string" ? parseItalianAmount(totalAmount) : null;
  } catch {
    return null;
  }
}

// DETAIL path: map the grant's own API object to a DetailGrant. Returns null on anything
// unexpected (malformed JSON, non-Bando), which the pipeline counts as detailSkipped (retried
// next run).
export async function parseDetailErSociale(raw: string, llm: LLMProvider): Promise<DetailGrant | null> {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  if (o["@type"] !== "Bando") return null;

  const title = typeof o.title === "string" ? o.title : "";
  const description = typeof o.description === "string" ? o.description : "";
  const destinatari = tokens(o.destinatari);
  const text = slateText(o.text);

  // Three-tier amount resolution, cheapest/safest first:
  // 1. The short description (1-3 sentences, e.g. "Con 1.000.000 euro di risorse...") — low risk
  //    of unrelated euro mentions, so the generic first-mention parser is safe.
  // 2. The long body text, anchored to total-signaling language ONLY (extractTotalFromProse):
  //    the body often ALSO states unrelated figures (expense caps, per-project thresholds) that
  //    a bare first-mention would wrongly pick — this is the bug this two-tier split fixes.
  // 3. A targeted LLM call, only when neither deterministic pass found anything.
  const amount = parseItalianAmount(description)
    ?? extractTotalFromProse(text ?? "")
    ?? await escalateAmountToLLM(`${description} ${text ?? ""}`.trim(), llm);

  return {
    summary: description || null,
    requirements: text ? text.slice(0, REQUIREMENTS_MAX_CHARS) : null,
    beneficiaries: destinatari.join(", ") || null,
    openingDate: isoDay(o.apertura_bando),
    fundingType: null,
    amount,
    minAmount: null,
    maxAmount: null,
    cofundingPercentage: null,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: slateText(o.riferimenti),
    deadline: isoDay(o.scadenza_bando),
    eligibleTypes: deriveEligibleTypes(destinatari),
    tags: deriveTags(tokens(o.materie), `${title} ${description}`),
    attachments: attachmentsFrom(o),
  };
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
  parseDetail: parseDetailErSociale, // detail via the grant's own API JSON — LLM only as last resort
  sanitize: (html) => html,          // the body is JSON, not HTML — nothing to sanitize
  chunkSize: 35_000,
  overlap: 2_000,
  boundaryTags: [],                  // no HTML boundaries in JSON; whitespace fallback is fine
  urlSnapping: false,                // @id values are canonical; no hrefs exist to snap to
  listing: { schema: ER_SOCIALE_SCHEMA, instructions: ER_SOCIALE_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: true,               // each grant's URL returns the full object incl. attachments
};
