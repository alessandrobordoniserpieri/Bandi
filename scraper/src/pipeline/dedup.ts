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

export function diffGrant(incoming: ExtractedGrant, existing: ExtractedGrant): Partial<ExtractedGrant> {
  const patch: Partial<ExtractedGrant> = {};
  for (const k of KEYS) {
    if (!equal(incoming[k], existing[k])) {
      (patch as Record<string, unknown>)[k] = incoming[k];
    }
  }
  return patch;
}

export type Decision =
  | { action: "insert" } | { action: "skip" } | { action: "update"; patch: Partial<ExtractedGrant> };

export function decide(incoming: ExtractedGrant, existing: ExtractedGrant | null): Decision {
  if (existing == null) return { action: "insert" };

  const expired = existing.status === "scaduto" || existing.status === "chiuso";
  if (expired) {
    const newEdition = incoming.deadline != null && incoming.deadline !== existing.deadline;
    return newEdition ? { action: "insert" } : { action: "skip" };
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
