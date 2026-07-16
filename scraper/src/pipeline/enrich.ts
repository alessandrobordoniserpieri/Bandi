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

export function parseItalianAmount(raw: string): number | null {
  // Strip a spelled-out currency ("Euro 900.000", "900.000 EUR") as well as the symbol/spaces,
  // otherwise the leftover letters make Number() return NaN and the amount is silently dropped.
  const cleaned = raw.replace(/euro|eur/gi, "").replace(/[€\s]/g, "");
  if (cleaned !== "" && /[0-9]/.test(cleaned)) {
    const n = toNumber(cleaned);
    if (n != null) return n;
  }
  // Fallback for free text carrying a TOTAL followed by a breakdown tail ("di cui: ...",
  // "Ripartizione: ...") — the whole-string parse above fails on the extra prose even though a
  // clean total figure is present. Pull just the first currency-adjacent figure instead.
  const m = AMOUNT_IN_TEXT_RE.exec(raw);
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
