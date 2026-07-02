export { calculateMatch } from "./calculate-match";
export type { MatchContext } from "./calculate-match";
export { buildMatchBreakdown } from "./breakdown";
export { buildMatchActions } from "./actions";
export { matchDecisionLabel } from "./verdict";
export { clientDocumentProfile, clientHasDocumentSignal } from "./document-profile";
export {
  hasCompatibleLegalType,
  legalTypeKey,
  isSportEntity,
  textOverlap,
  deadlineDays,
  deadlineLabel,
  isClosedGrant,
  isOpenGrant,
  matchSignals,
  inferGrantEvaluationCriteria,
  inferGrantRequestedDocuments,
} from "./helpers";
export { LEGAL_TYPES, TAGS, CAPACITY_SCORE, GEO_SCORE } from "./constants";
export type {
  ClientProfile,
  ClientDocument,
  Grant,
  CapacityLevel,
  ComplexityLevel,
  Verdict,
  BreakdownItem,
  DocumentProfile,
  MatchResult,
} from "./types";
