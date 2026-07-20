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

// docs/superpowers/specs/2026-07-20-source-id-detail-priority-attribution.md — findGrantsNeedingDetail
// filters by source_id, so whichever source "owns" a duplicate grant is the ONLY one that can ever
// enrich it via the detail phase. Plain last-writer-wins (used for every other field) can strand a
// grant on a detailEnabled:false owner (e.g. an aggregator) forever. detailEnabledBySource covers
// only currently-ENABLED sources; an owner absent from it (disabled/deleted since it last wrote this
// row) is treated as unknown capability — never preferred over a known detailEnabled:true source.
export function resolveSourceId(
  incomingSourceId: string | null,
  existing: { sourceId: string | null; detailFetchedAt: string | null },
  detailEnabledBySource: Map<string, boolean>,
  incomingDetailEnabled: boolean,
): string | null {
  if (existing.sourceId == null) return incomingSourceId;

  // Owner no longer among currently-enabled sources: capability unknown, kept distinct from
  // "known detailEnabled:false" — never preferred over a KNOWN detailEnabled:true incoming
  // source, but otherwise left alone (no active, known source is being displaced).
  if (!detailEnabledBySource.has(existing.sourceId)) {
    return incomingDetailEnabled ? incomingSourceId : existing.sourceId;
  }

  const existingDetailEnabled = detailEnabledBySource.get(existing.sourceId)!;
  if (incomingDetailEnabled !== existingDetailEnabled) {
    return incomingDetailEnabled ? incomingSourceId : existing.sourceId;
  }
  if (incomingDetailEnabled && existingDetailEnabled) {
    // Both capable: frozen once detail has actually been fetched (same grant.url either way —
    // reattributing after that would only re-fetch the identical page for no benefit).
    return existing.detailFetchedAt == null ? incomingSourceId : existing.sourceId;
  }
  // Both known and both incapable: no capability signal to prefer one over the other — today's default.
  return incomingSourceId;
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

// An administrative notice (proroga/rettifica/errata corrige/…) is never a new opportunity —
// skip it at insert time, same spirit as isExpiredAtIngest. Applies ONLY to inserts: a grant
// already stored keeps updating normally via the diffGrant path below regardless of grantType
// (grantType is excluded from KEYS — see the field's comment in types.ts).
function insertOrSkip(incoming: ExtractedGrant, today: string): Decision {
  if (incoming.grantType === "amministrativo") return { action: "skip" };
  return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
}

export function decide(
  incoming: ExtractedGrant,
  existing: ExtractedGrant | null,
  today: string = todayIso(),
): Decision {
  if (existing == null) return insertOrSkip(incoming, today);

  const expired = existing.status === "scaduto" || existing.status === "chiuso";
  if (expired) {
    const newEdition = incoming.deadline != null && incoming.deadline !== existing.deadline;
    if (!newEdition) return { action: "skip" };
    // A new edition is still only worth inserting if that edition is itself still open.
    return insertOrSkip(incoming, today);
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
