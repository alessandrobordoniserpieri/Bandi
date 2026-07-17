// scraper/src/pipeline/dedup.ts
import type { ExtractedGrant } from "./types";

const TRACKING = /^(utm_.*|fbclid|gclid|ref)$/i;

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;
  return u.toString();
}

const KEYS: (keyof ExtractedGrant)[] = [
  "title", "url", "providerId", "sourceId", "deadline", "status", "amount", "cofundingRequired",
  "eligibleTypes", "tags", "area", "geoScope", "complexity", "requiredDocuments",
  "summary", "requirements", "beneficiaries",
  "openingDate", "fundingType", "minAmount", "maxAmount", "cofundingPercentage",
  "eligibleExpenses", "applicationMethod", "contactInfo",
];

function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((x, i) => x === sortedB[i]);
  }
  return a === b;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// Never blank out an existing field with null/""/[]. A missed extraction on a re-scrape
// must not delete data we successfully captured before. Only fill nulls or replace one
// concrete value with another.
export function diffGrant(incoming: ExtractedGrant, existing: ExtractedGrant): Partial<ExtractedGrant> {
  const patch: Partial<ExtractedGrant> = {};
  for (const k of KEYS) {
    if (equal(incoming[k], existing[k])) continue;
    if (isEmpty(incoming[k]) && !isEmpty(existing[k])) continue;
    (patch as Record<string, unknown>)[k] = incoming[k];
  }
  return patch;
}

export type Decision =
  | { action: "insert" } | { action: "skip" } | { action: "update"; patch: Partial<ExtractedGrant> };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// A grant we've never stored is only worth ingesting while applications are still open. A brand-new
// listing that's ALREADY expired is not back-filled — we never tracked it, so importing its history
// is noise. Robust across archetypes: an explicit scaduto/chiuso status OR a deadline already in the
// past both count (the latter catches the generic LLM archetype, which may leave status "aperto"
// despite a past deadline). A null deadline can't be proven expired (rolling/always-open) → not
// expired. This gate applies ONLY to inserts; grants already in the system expire in place via the
// update path (status flips to scaduto, row kept) and the daily expire_grants() cron.
function isExpiredAtIngest(g: ExtractedGrant, today: string): boolean {
  if (g.status === "scaduto" || g.status === "chiuso") return true;
  return g.deadline != null && g.deadline < today;
}

export function decide(
  incoming: ExtractedGrant,
  existing: ExtractedGrant | null,
  today: string = todayIso(),
): Decision {
  if (existing == null) {
    return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
  }

  const expired = existing.status === "scaduto" || existing.status === "chiuso";
  if (expired) {
    const newEdition = incoming.deadline != null && incoming.deadline !== existing.deadline;
    if (!newEdition) return { action: "skip" };
    // A new edition is still only worth inserting if that edition is itself still open.
    return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
