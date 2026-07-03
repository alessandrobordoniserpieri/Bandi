import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL } from "../constants";

export function scoreThemes(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.themes;
  const grantTags = grant.tags ?? [];
  if (grantTags.length === 0) {
    return { value: NEUTRAL.themes, max, note: "il bando non specifica temi" };
  }
  const shared = (profile.themes ?? []).filter((t) => grantTags.includes(t));
  const value = Math.min(max, Math.round((shared.length / grantTags.length) * max));
  const note = shared.length
    ? `${shared.length} tema/i in comune su ${grantTags.length}`
    : "nessun tema in comune";
  return { value, max, note };
}
