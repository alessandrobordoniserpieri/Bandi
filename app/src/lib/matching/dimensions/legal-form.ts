import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, groupForLegalType } from "../constants";

export function scoreLegalForm(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.legalForm;
  const eligible = grant.eligibleTypes ?? [];
  if (eligible.length === 0) {
    return { value: max, max, note: "bando aperto a tutte le forme giuridiche" };
  }
  if (eligible.includes(profile.legalType)) {
    return { value: max, max, note: "forma giuridica ammessa" };
  }
  const myGroup = groupForLegalType(profile.legalType);
  if (myGroup && eligible.some((t) => groupForLegalType(t) === myGroup)) {
    return { value: Math.round(max / 2), max, note: "gruppo compatibile, sottotipo diverso" };
  }
  return { value: 0, max, note: "forma giuridica non ammessa" };
}
