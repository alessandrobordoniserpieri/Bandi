import type { Verdict } from "./types";
import { VERDICT_THRESHOLDS } from "./constants";

export function deriveVerdict(
  score: number,
  hasAllDocuments: boolean,
  isClosed: boolean,
): Verdict {
  if (isClosed) return "Storico";
  if (score >= VERDICT_THRESHOLDS.candidabile) {
    return hasAllDocuments ? "Candidabile" : "Da preparare";
  }
  if (score >= VERDICT_THRESHOLDS.daValutare) return "Da valutare";
  if (score >= VERDICT_THRESHOLDS.bassaPriorita) return "Bassa priorità";
  return "Non compatibile";
}
