// scraper/src/pipeline/enrich.ts
import type { ExtractedGrant } from "./types";
import type { GeoScope } from "./vocab";

const REGIONS = new Set([
  "abruzzo","basilicata","calabria","campania","emilia-romagna","friuli-venezia giulia",
  "lazio","liguria","lombardia","marche","molise","piemonte","puglia","sardegna","sicilia",
  "toscana","trentino-alto adige","umbria","valle d'aosta","veneto",
]);

export function parseItalianAmount(raw: string): number | null {
  // Strip a spelled-out currency ("Euro 900.000", "900.000 EUR") as well as the symbol/spaces,
  // otherwise the leftover letters make Number() return NaN and the amount is silently dropped.
  const cleaned = raw.replace(/euro|eur/gi, "").replace(/[€\s]/g, "");
  if (cleaned === "" || !/[0-9]/.test(cleaned)) return null;
  // Italian format: '.' thousands, ',' decimals.
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
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
