import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS } from "../constants";

function baseFor(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 2;
  if (count <= 5) return 4;
  return 5;
}

export function scoreTrackRecord(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.trackRecord;
  const fundedCount = (profile.projectHistory ?? []).filter((r) => r.outcome === "finanziato").length;
  let value = baseFor(fundedCount);
  const sameKind =
    grant.providerKind != null && (profile.fundingTypesReceived ?? []).includes(grant.providerKind);
  if (sameKind) value = Math.min(max, value + 1);
  const note = fundedCount
    ? `${fundedCount} progetto/i finanziato/i${sameKind ? ", stesso tipo di fondo" : ""}`
    : "nessun progetto finanziato in storico";
  return { value, max, note };
}
