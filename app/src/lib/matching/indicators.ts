import type {
  EntityProfile, Grant, Indicators, DeadlineIndicator, CofundingIndicator, DeadlineColor,
} from "./types";
import { deadlineDays, isClosedGrant } from "./helpers";

function deadlineIndicator(grant: Grant): DeadlineIndicator {
  if (isClosedGrant(grant)) return { days: deadlineDays(grant.deadline), color: "nero", label: "bando chiuso" };
  const days = deadlineDays(grant.deadline);
  let color: DeadlineColor = "verde";
  if (days == null) color = "verde";
  else if (days < 7) color = "rosso";
  else if (days < 15) color = "giallo";
  const label = days == null ? "senza scadenza" : `scade tra ${days} giorni`;
  return { days, color, label };
}

function cofundingIndicator(profile: EntityProfile, grant: Grant): CofundingIndicator {
  const required = grant.cofundingRequired;
  if (required == null) return { required: null, color: "grigio", label: "cofinanziamento non specificato" };
  const capacity = profile.cofundingCapacity;
  let color: CofundingIndicator["color"] = "giallo";
  if (capacity != null && capacity >= required) color = "verde";
  else if (required > 20) color = "rosso";
  return { required, color, label: `cofinanziamento richiesto ${required}%` };
}

export function buildIndicators(profile: EntityProfile, grant: Grant): Indicators {
  return { deadline: deadlineIndicator(grant), cofunding: cofundingIndicator(profile, grant) };
}
