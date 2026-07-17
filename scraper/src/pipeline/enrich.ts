// scraper/src/pipeline/enrich.ts
import type { ExtractedGrant } from "./types";
import type { GeoScope } from "./vocab";

const REGIONS = new Set([
  "abruzzo","basilicata","calabria","campania","emilia-romagna","friuli-venezia giulia",
  "lazio","liguria","lombardia","marche","molise","piemonte","puglia","sardegna","sicilia",
  "toscana","trentino-alto adige","umbria","valle d'aosta","veneto",
]);

// Italian format: '.' thousands, ',' decimals — strip thousands dots, decimal comma → point.
function toNumber(digits: string): number | null {
  const normalized = digits.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// A currency-adjacent figure: starts and ends on a digit (so trailing punctuation from
// surrounding prose, e.g. a sentence-ending period, is never swept into the capture).
const AMOUNT_TOKEN = "[0-9](?:[0-9.,]*[0-9])?";
// "euro"/"€" can precede OR follow the number in Italian bureaucratic prose (sportesalute:
// "400.000 Euro"; ER Sociale: "ammontano a euro 1.371.182,26") — try both orders.
const AMOUNT_IN_TEXT_RE = new RegExp(
  `(?:(?:euro|€)\\s*(${AMOUNT_TOKEN}))|(?:(${AMOUNT_TOKEN})\\s*(?:euro|€))`, "i",
);

// Some sources spell out large totals ("50 milioni di euro", "pari ad euro 100 milioni") instead
// of digits. Expand "N milion[ei]" (optionally followed by "di euro"/"euro") to its digit form
// BEFORE the rest of this function runs, so the existing digit-based parsing handles it unchanged.
// Verified against avvisibandi.sport.governo.it (2026-07-17): every real occurrence in that corpus
// names a euro total this way; no other unit is ever spelled out as "milioni" in this domain, so
// forcing "euro" onto the expansion is safe. Intentionally does NOT handle "mila" (thousands) —
// no real bando in the checked corpus spells out a TOTAL that way (only per-project caps like
// "700mila euro", which the signal-anchored callers already exclude by sentence, not by this fn).
const MILLIONS_RE = /([0-9]+(?:[.,][0-9]+)?)\s*milion[ei]\s*(?:di\s+)?(?:euro|€)?/gi;
function expandSpelledOutMillions(s: string): string {
  return s.replace(MILLIONS_RE, (match, num: string) => {
    const n = Number(num.replace(",", "."));
    return Number.isFinite(n) ? `${Math.round(n * 1_000_000)} euro` : match;
  });
}

export function parseItalianAmount(raw: string): number | null {
  const expanded = expandSpelledOutMillions(raw);
  // Strip a spelled-out currency ("Euro 900.000", "900.000 EUR") as well as the symbol/spaces,
  // otherwise the leftover letters make Number() return NaN and the amount is silently dropped.
  const cleaned = expanded.replace(/euro|eur/gi, "").replace(/[€\s]/g, "");
  if (cleaned !== "" && /[0-9]/.test(cleaned)) {
    const n = toNumber(cleaned);
    if (n != null) return n;
  }
  // Fallback for free text carrying a TOTAL followed by a breakdown tail ("di cui: ...",
  // "Ripartizione: ...") — the whole-string parse above fails on the extra prose even though a
  // clean total figure is present. Pull just the first currency-adjacent figure instead.
  const m = AMOUNT_IN_TEXT_RE.exec(expanded);
  const digits = m?.[1] ?? m?.[2];
  return digits ? toNumber(digits) : null;
}

function inferGeoScope(area: string): GeoScope | null {
  const a = area.trim().toLowerCase();
  if (a === "italia") return "nazionale";
  if (a === "unione europea" || a === "europa" || a === "ue") return "europeo";
  if (REGIONS.has(a)) return "regionale";
  return null;
}

export function enrich(grant: ExtractedGrant): ExtractedGrant {
  const status = grant.status ?? "aperto";
  let geoScope = grant.geoScope;
  if (geoScope == null && grant.area) geoScope = inferGeoScope(grant.area);
  return { ...grant, status, geoScope };
}

// exported for callers that receive raw string amounts before validation
export function normalizeAmountString(s: string | null): number | null {
  return s == null ? null : parseItalianAmount(s);
}
