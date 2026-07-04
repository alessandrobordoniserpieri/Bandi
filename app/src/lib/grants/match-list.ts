import { calculateMatch, type EntityProfile, type MatchResult } from "@/lib/matching";
import type { GrantView } from "./mapping";

export type MatchedGrant = GrantView & { match: MatchResult };

export function buildMatchedGrants(profile: EntityProfile, views: GrantView[]): MatchedGrant[] {
  const matched: MatchedGrant[] = views.map((v) => ({ ...v, match: calculateMatch(profile, v.grant) }));
  // Closed grants (verdict "Storico") always sink below open ones; within a group,
  // higher score first. Array.prototype.sort is stable (ES2019+), so equal keys
  // keep input order.
  return matched.sort((a, b) => {
    const aClosed = a.match.verdict === "Storico" ? 1 : 0;
    const bClosed = b.match.verdict === "Storico" ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return b.match.score - a.match.score;
  });
}
