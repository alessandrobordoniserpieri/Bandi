import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL, DOCUMENT_KEYS, type DocumentKey } from "../constants";

const isKnownKey = (k: string): k is DocumentKey =>
  (DOCUMENT_KEYS as readonly string[]).includes(k);

export function scoreDocuments(
  profile: EntityProfile,
  grant: Grant,
): DimensionScore & { missing: string[] } {
  const max = WEIGHTS.documents;
  const required = (grant.requiredDocuments ?? []).filter(isKnownKey);
  if (required.length === 0) {
    return { value: NEUTRAL.documents, max, note: "il bando non specifica documenti", missing: [] };
  }
  const missing = required.filter((k) => !profile.documents[k]);
  const possessed = required.length - missing.length;
  const value = Math.round((possessed / required.length) * max);
  const note = missing.length ? `mancano: ${missing.join(", ")}` : "documenti completi";
  return { value, max, note, missing };
}
