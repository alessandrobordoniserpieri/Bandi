import type { MatchResult, Verdict } from "./types";
import { isClosedGrant } from "./helpers";
import { clientDocumentProfile } from "./document-profile";

export function matchDecisionLabel(match: MatchResult): Verdict {
  if (isClosedGrant(match.grant)) return "Storico";

  const docs = clientDocumentProfile(match.client, match.grant).score;

  if (match.score >= 75 && docs >= 65) return "Candidabile";
  if (match.score >= 75) return "Da preparare";
  if (match.score >= 55) return "Da preparare";
  if (match.score >= 35) return "Da verificare";
  return "Bassa priorità";
}
