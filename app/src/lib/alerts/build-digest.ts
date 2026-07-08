// app/src/lib/alerts/build-digest.ts
// Pure. Given the week's new grants (the caller scopes them to the last 7 days), keep those the
// entity matches at or above its score threshold, best first, capped at 10. Returns null when
// nothing qualifies so we never send an empty email.
import type { EntityProfile, Verdict } from "@/lib/matching";
import { buildMatchedGrants } from "@/lib/grants/match-list";
import type { GrantView } from "@/lib/grants/mapping";

export const DEFAULT_THRESHOLD = 50;
const MAX_ITEMS = 10;

export interface DigestItem {
  grantId: string;
  title: string;
  providerName: string | null;
  score: number;
  verdict: Verdict;
  deadline: string | null;
}

export interface Digest {
  threshold: number;
  items: DigestItem[];
}

export function buildDigest(
  profile: EntityProfile,
  threshold: number,
  newViews: GrantView[],
): Digest | null {
  const items = buildMatchedGrants(profile, newViews)
    .filter((m) => m.match.verdict !== "Storico" && m.match.score >= threshold)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, MAX_ITEMS)
    .map((m) => ({
      grantId: m.grant.id,
      title: m.grant.title,
      providerName: m.providerName,
      score: m.match.score,
      verdict: m.match.verdict,
      deadline: m.grant.deadline,
    }));

  return items.length ? { threshold, items } : null;
}
