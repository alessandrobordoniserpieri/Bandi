// scraper/src/pipeline/sport-governo.ts
// Archetype "sport-governo": Dipartimento per lo Sport (avvisibandi.sport.governo.it) via direct
// fetch of server-rendered Next.js pages — the listing homepage and each notice's own page both
// embed a <script id="__NEXT_DATA__"> JSON blob with the full data, no headless Chrome needed.
// Design: docs/superpowers/specs/2026-07-17-sport-governo-archetype-design.md
import { LEGAL_TYPE_SET, TAG_SET } from "./vocab";
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE, escalateEconomicsToLLM } from "./economics";
import { deriveRequiredDocuments } from "./documents";
import type { Archetype, DetailGrant, GrantAttachment } from "./types";
import type { JsonSchema, LLMProvider } from "../providers/types";

// Strips tags to EMPTY (not a space): real Quill HTML here always carries its own whitespace at
// real word boundaries ("...Giovani,\n    <strong>Andrea Abodi</strong>,..."), but an inline tag
// often closes directly against trailing punctuation with no space at all — injecting one there
// produces "Abodi , e" / "partecipare ." instead of "Abodi, e" / "partecipare." (verified against
// the real Oratori description, which has exactly this "</strong>," pattern).
function innerText(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Quill-authored description HTML (avvisibandi.sport.governo.it): a flat sequence of top-level
// blocks (p/h1-h6/ul/ol, occasionally a bare <b>) separated by blank lines. Regex-based (not a DOM
// parser) — consistent with the rest of the scraper (see stripTags in archetypes.ts) and sufficient
// for the limited, regular tag set actually observed live: p, b, strong, em, u, span, a, h3, ul, li.
export function htmlToLightMarkup(html: string): string {
  const blocks = html.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const block of blocks) {
    const heading = /^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>$/i.exec(block);
    if (heading) {
      const level = Number(heading[1]);
      const text = innerText(heading[2]!);
      if (text) lines.push(`${level <= 2 ? "##" : "###"} ${text}`);
      continue;
    }
    const list = /^<(ul|ol)[^>]*>([\s\S]*?)<\/\1>$/i.exec(block);
    if (list) {
      const items = list[2]!.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      for (const item of items) {
        const text = innerText(item.replace(/^<li[^>]*>|<\/li>$/gi, ""));
        if (text) lines.push(`- ${text}`);
      }
      continue;
    }
    const text = innerText(block);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

// dest -> LEGAL_TYPES, verified against all 22 real notices (2026-07-17). Religious/ecclesiastical
// tokens map to real entries that already exist in LEGAL_TYPES ("Ente ecclesiastico civilmente
// riconosciuto" covers dioceses/religious institutes/societies of apostolic life under the 1985
// Concordato; "Parrocchia / Oratorio" is a direct match; "Ente religioso" is the generic fallback
// for non-Catholic confessions and generic "enti_ecclesiali"). "pf" (persona fisica) has no and can
// never have an equivalent — this platform matches organizations, not individuals.
const DEST_TO_LEGAL_TYPES: Record<string, readonly string[]> = {
  asd: ["ASD - Associazione Sportiva Dilettantistica"],
  ssd: ["SSD - Società Sportiva Dilettantistica"],
  eps: ["EPS - Ente di Promozione Sportiva"],
  fed: ["FSN - Federazione Sportiva Nazionale"],
  dsa: ["DSA - Disciplina Sportiva Associata"],
  ets: [
    "APS - Associazione di Promozione Sociale", "ODV - Organizzazione di Volontariato",
    "ETS - Ente del Terzo Settore", "Rete associativa ETS", "ONG / OSC",
    "Cooperativa sociale tipo A", "Cooperativa sociale tipo B", "Consorzio di cooperative sociali",
    "Impresa sociale", "Fondazione ETS", "Società di mutuo soccorso", "Ente filantropico",
  ],
  onlus: ["ONLUS"],
  pa: ["Ente pubblico"],
  company: ["Impresa"],
  ats: ["Raggruppamento temporaneo / ATS"],
  diocesi: ["Ente ecclesiastico civilmente riconosciuto"],
  istituti_religiosi: ["Ente ecclesiastico civilmente riconosciuto"],
  societa_vita_apostolica: ["Ente ecclesiastico civilmente riconosciuto"],
  provincia_vita_apostolica: ["Ente ecclesiastico civilmente riconosciuto"],
  provincia_istituto_religioso: ["Ente ecclesiastico civilmente riconosciuto"],
  parrocchia: ["Parrocchia / Oratorio"],
  ets_oratori: ["Parrocchia / Oratorio"],
  enti_ecclesiali: ["Ente religioso"],
  enti_altre_confessioni: ["Ente religioso"],
  // "pf" deliberately absent: no mapping, by design (see ADR-010).
};

export function deriveEligibleTypes(dest: string[]): string[] {
  const out = new Set<string>();
  for (const d of dest) {
    for (const t of DEST_TO_LEGAL_TYPES[d] ?? []) out.add(t);
  }
  return [...out].filter((t) => LEGAL_TYPE_SET.has(t));
}

// ADR-010: a notice whose dest is non-empty but maps to nothing represents a restriction to a
// category this platform doesn't represent (verified: only dest === ["pf"] on the real 22-notice
// corpus) — skip it so it never reads as "open to everyone" via an empty eligibleTypes. An EMPTY
// dest is a different case (no restriction stated at all) and must NOT be skipped.
export function shouldSkipNotice(dest: string[]): boolean {
  return dest.length > 0 && deriveEligibleTypes(dest).length === 0;
}

const TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /periferie/i, tag: "periferie" },
  { re: /impiant[oi] sportiv/i, tag: "impianti sportivi" },
  { re: /famigli/i, tag: "famiglie" },
  { re: /evento|eventi/i, tag: "eventi" },
  { re: /giovan/i, tag: "giovani" },
  { re: /disabil/i, tag: "disabilità" },
];

export function deriveTags(title: string, description: string): string[] {
  const out = new Set<string>(["sport"]);
  const text = `${title} ${description}`;
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) out.add(rule.tag);
  }
  return [...out].filter((t) => TAG_SET.has(t));
}

function extractNextData(raw: string): unknown | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(raw);
  if (!m) return null;
  try { return JSON.parse(m[1]!); } catch { return null; }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
}

function noticeUrl(id: string): string {
  return `https://avvisibandi.sport.governo.it/bandi/${id}`;
}

function statusFrom(deadline: string | null, today: string): "aperto" | "chiuso" | "scaduto" | null {
  if (!deadline) return null;
  return deadline < today ? "scaduto" : "aperto";
}

interface RawNotice {
  _id?: unknown; title?: unknown; description?: unknown; dest?: unknown;
  schedule?: { compilazione?: { end?: unknown } };
}

// PRIMARY listing path: parse the homepage's embedded __NEXT_DATA__ straight into raw grant
// items — no LLM. Returns [] on anything unexpected, which makes extractGrants fall back to the
// LLM path (same contract as every other code-parsed archetype).
export function parseSportGoverno(raw: string): unknown[] {
  const data = extractNextData(raw) as { props?: { pageProps?: { notices?: unknown[] } } } | null;
  const notices = data?.props?.pageProps?.notices;
  if (!Array.isArray(notices)) return [];
  const today = todayIso();
  const out: unknown[] = [];
  for (const item of notices) {
    if (typeof item !== "object" || item === null) continue;
    const n = item as RawNotice;
    const id = typeof n._id === "string" ? n._id : null;
    const title = typeof n.title === "string" ? n.title : null;
    if (!id || !title) continue;
    const description = typeof n.description === "string" ? n.description : "";
    const dest = Array.isArray(n.dest) ? n.dest.filter((d): d is string => typeof d === "string") : [];
    if (shouldSkipNotice(dest)) continue;
    const deadline = isoDay(n.schedule?.compilazione?.end);
    const summary = htmlToLightMarkup(description) || null;
    out.push({
      title,
      url: noticeUrl(id),
      summary,
      deadline,
      status: statusFrom(deadline, today),
      // Unlike er-sociale/sportesalute, this source has no separate SHORT summary field safe to
      // parse whole — `description` IS the full body prose, exactly as red-herring-prone as
      // er-sociale's `text` (e.g. "di cui € 30.000.000" next to the real "100 milioni" total).
      // Passing it raw here would hand coerce()'s unguarded numOrNull the same red-herring risk
      // er-sociale's sentence-anchoring was built to prevent. Leave amount to the detail phase,
      // which resolves it safely via extractAnchoredAmount (see parseDetailSportGoverno).
      amount: null,
      area: null,
      geoScope: "nazionale",
      eligibleTypes: deriveEligibleTypes(dest),
      tags: deriveTags(title, description),
    });
  }
  return out;
}

// Real phrasing observed live (2026-07-17), distinct from er-sociale's own signal words: totals
// here are introduced by "finanziata con"/"stanziato"/"dotazione di"/"ammontano a"/"finanziamento
// complessivo" — verified against all 22 real notices before writing this regex.
const SPORT_GOVERNO_TOTAL_SIGNAL_RE = /finanziat[ao] con|stanziat[oi]|stanziamento|ammontano a|dotazione di|finanziamento complessivo/i;

function attachmentsFrom(raw: unknown): GrantAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: GrantAttachment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    if (typeof a.name !== "string" || typeof a.url !== "string") continue;
    out.push({ title: a.name, url: a.url, mimeType: null });
  }
  return out;
}

interface RawNoticeDetail extends RawNotice {
  code?: unknown;
  attachments?: unknown;
}

// DETAIL path: map the notice's own page object to a DetailGrant. Returns null on anything
// unexpected (malformed JSON, missing notice), counted as detailSkipped and retried next run.
export async function parseDetailSportGoverno(raw: string, llm: LLMProvider): Promise<DetailGrant | null> {
  const data = extractNextData(raw) as { props?: { pageProps?: { notice?: unknown } } } | null;
  const n = data?.props?.pageProps?.notice;
  if (typeof n !== "object" || n === null) return null;
  const notice = n as RawNoticeDetail;

  const title = typeof notice.title === "string" ? notice.title : "";
  const description = typeof notice.description === "string" ? notice.description : "";
  const dest = Array.isArray(notice.dest) ? notice.dest.filter((d): d is string => typeof d === "string") : [];
  const code = typeof notice.code === "string" ? notice.code : null;
  const markup = htmlToLightMarkup(description);
  const withCode = code ? `Codice: ${code}\n${markup}` : markup;

  // Unlike er-sociale (which has a separate short `description` safe to whole-string-parse before
  // falling back to sentence-anchoring on the longer `text` body), sport-governo has only ONE
  // `description` field that IS the full body — applying an unguarded whole-text parse to it would
  // reopen exactly the red-herring bug class er-sociale's sentence-anchoring exists to prevent
  // (e.g. "di cui € 30.000.000" appearing right next to the real "100 milioni" total, or an
  // unrelated per-project cap earlier in the text). So there is only ONE deterministic tier here:
  // sentence-anchored, same as er-sociale's second tier.
  const combinedText = markup;
  let amount = extractAnchoredAmount(combinedText, SPORT_GOVERNO_TOTAL_SIGNAL_RE);
  let cofundingPercentage = extractAnchoredPercentage(combinedText, COFUNDING_SIGNAL_RE);
  if (amount == null) {
    const escalated = await escalateEconomicsToLLM(combinedText, llm);
    amount = escalated.amount;
    if (cofundingPercentage == null) cofundingPercentage = escalated.cofundingPercentage;
  }

  const deadline = isoDay(notice.schedule?.compilazione?.end);

  return {
    summary: withCode || null,
    requirements: withCode || null,
    beneficiaries: dest.join(", ") || null,
    openingDate: null,
    fundingType: null,
    amount,
    minAmount: null,
    maxAmount: null,
    cofundingPercentage,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: null,
    deadline,
    eligibleTypes: deriveEligibleTypes(dest),
    tags: deriveTags(title, description),
    // From the plain-text markup, not the raw HTML — so tag names in attributes never leak in.
    requiredDocuments: deriveRequiredDocuments(`${title} ${markup}`),
    attachments: attachmentsFrom(notice.attachments),
  };
}

// LLM fallback (used only if parse() returns [], e.g. the site's data shape changed): the body is
// the raw page HTML including the __NEXT_DATA__ script tag, so the instructions explain that shape.
const SPORT_GOVERNO_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
      summary: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const SPORT_GOVERNO_INSTRUCTIONS = [
  "Il contenuto è la pagina HTML di un sito Next.js del Dipartimento per lo Sport (Governo italiano): contiene uno script con id \"__NEXT_DATA__\" il cui JSON ha props.pageProps.notices, un array di bandi.",
  "Per ogni bando estrai: title, url (costruiscila come https://avvisibandi.sport.governo.it/bandi/<_id> usando il campo _id), deadline (da schedule.compilazione.end, solo la data YYYY-MM-DD), summary (da description, testo semplice senza tag HTML).",
  "Usa null per i campi mancanti. Non inventare valori.",
].join(" ");

export const SPORT_GOVERNO_ARCHETYPE: Archetype = {
  name: "sport-governo",
  parse: parseSportGoverno,             // primary path — no LLM
  parseDetail: parseDetailSportGoverno, // detail via the notice's own page JSON — LLM only for amount/cofunding escalation
  sanitize: (html) => html,             // parsed via __NEXT_DATA__ extraction; nothing to sanitize
  chunkSize: 35_000,
  overlap: 2_000,
  boundaryTags: [],                     // no clean HTML boundary in a JSON-embedded-in-HTML page; whitespace fallback is fine
  urlSnapping: false,                   // URLs are constructed from _id, always canonical
  listing: { schema: SPORT_GOVERNO_SCHEMA, instructions: SPORT_GOVERNO_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: true,
};
