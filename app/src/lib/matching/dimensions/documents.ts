import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL, DOCUMENT_KEYS, type DocumentKey } from "../constants";

const isKnownKey = (k: string): k is DocumentKey =>
  (DOCUMENT_KEYS as readonly string[]).includes(k);

export function scoreDocuments(
  profile: EntityProfile,
  grant: Grant,
): DimensionScore & { missing: string[]; known: boolean } {
  const max = WEIGHTS.documents;
  const required = (grant.requiredDocuments ?? []).filter(isKnownKey);
  if (required.length === 0) {
    // We didn't capture the grant's required documents (no source extracts the full list — it
    // usually lives in the attached PDF). This is UNKNOWN, not "no documents required": known=false
    // so the UI says "consulta il bando" and the verdict never promises readiness on this basis.
    return { value: NEUTRAL.documents, max, note: "documenti richiesti non disponibili", missing: [], known: false };
  }
  const missing = required.filter((k) => !profile.documents[k]);
  const possessed = required.length - missing.length;
  const value = Math.round((possessed / required.length) * max);
  const note = missing.length ? `mancano: ${missing.join(", ")}` : "documenti completi";
  return { value, max, note, missing, known: true };
}
