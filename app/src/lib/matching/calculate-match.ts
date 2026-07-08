import type { EntityProfile, Grant, MatchResult, DimensionScore, DimensionKey } from "./types";
import { scoreThemes } from "./dimensions/themes";
import { scoreLegalForm } from "./dimensions/legal-form";
import { scoreTerritory } from "./dimensions/territory";
import { scoreCapacity } from "./dimensions/capacity";
import { scoreDocuments } from "./dimensions/documents";
import { scoreTrackRecord } from "./dimensions/track-record";
import { computeBonuses } from "./bonuses";
import { buildIndicators } from "./indicators";
import { buildBreakdown } from "./breakdown";
import { buildActions } from "./actions";
import { deriveVerdict } from "./verdict";
import { matchHistory } from "./storico-match";
import { isClosedGrant } from "./helpers";

export function calculateMatch(profile: EntityProfile, grant: Grant): MatchResult {
  const documents = scoreDocuments(profile, grant);
  const dims: Record<DimensionKey, DimensionScore> = {
    themes: scoreThemes(profile, grant),
    legalForm: scoreLegalForm(profile, grant),
    territory: scoreTerritory(profile, grant),
    capacity: scoreCapacity(profile, grant),
    documents: { value: documents.value, max: documents.max, note: documents.note },
    trackRecord: scoreTrackRecord(profile, grant),
  };

  const baseScore = (Object.keys(dims) as DimensionKey[]).reduce((s, k) => s + dims[k].value, 0);
  const bonuses = computeBonuses(profile, grant);
  const bonusTotal = bonuses.reduce((s, b) => s + b.value, 0);
  const score = Math.max(0, Math.min(100, baseScore + bonusTotal));

  const breakdown = buildBreakdown(dims);
  const closed = isClosedGrant(grant);
  const verdict = deriveVerdict(score, documents.missing.length === 0, closed);
  const actions = buildActions(grant, breakdown, documents.missing);

  return {
    score,
    baseScore,
    verdict,
    breakdown,
    bonuses,
    indicators: buildIndicators(profile, grant),
    historyBadge: matchHistory(profile.projectHistory, grant),
    missingDocuments: documents.missing,
    actions,
  };
}
