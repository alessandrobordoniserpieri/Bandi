export { calculateMatch } from "./calculate-match";
export { deriveVerdict } from "./verdict";
export { buildBreakdown } from "./breakdown";
export { buildActions } from "./actions";
export { buildIndicators } from "./indicators";
export { computeBonuses } from "./bonuses";
export { economicCoherence } from "./economic-coherence";
export { scoreThemes } from "./dimensions/themes";
export { scoreLegalForm } from "./dimensions/legal-form";
export { scoreTerritory } from "./dimensions/territory";
export { calculateCapacity, scoreCapacity } from "./dimensions/capacity";
export { scoreDocuments } from "./dimensions/documents";
export { scoreTrackRecord } from "./dimensions/track-record";
export { deadlineDays, isClosedGrant } from "./helpers";
export {
  LEGAL_TYPES, TAGS, LEGAL_TYPE_GROUPS, TAG_MACRO_AREAS, PROVINCES, PROVINCE_TO_REGION,
  WEIGHTS, CAPACITY_MATRIX, DOCUMENT_KEYS, VERDICT_THRESHOLDS, NEUTRAL,
  regionForProvince, groupForLegalType,
} from "./constants";
export type {
  GeoScope, ComplexityLevel, CapacityLevel, ProviderKind, GrantStatus, ProjectOutcome,
  Verdict, CapacityAnswers, EntityDocuments, ProjectHistoryRow, EntityProfile, Grant,
  DimensionScore, DimensionKey, BreakdownItem, BonusItem, Indicators, MatchResult,
  EconomicLevel, EconomicCoherence, EconomicIndicator,
} from "./types";
