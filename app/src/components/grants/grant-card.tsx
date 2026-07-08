// app/src/components/grants/grant-card.tsx
import Link from "next/link";
import type { MatchedGrant } from "@/lib/grants/match-list";
import { DeadlineBadge } from "./deadline-badge";
import { VerdictBadge } from "./verdict-badge";
import { AmountBadge } from "./amount-badge";
import { HistoryBadge } from "./history-badge";

export function GrantCard({ matched }: { matched: MatchedGrant }) {
  const { grant, providerName, match } = matched;
  return (
    <article>
      <h3><Link href={`/bandi/${grant.id}`}>{grant.title}</Link></h3>
      {providerName && <p>{providerName}</p>}
      <p>
        <DeadlineBadge indicator={match.indicators.deadline} />{" "}
        <strong>{match.score}</strong>/100{" "}
        <VerdictBadge verdict={match.verdict} />
        {match.historyBadge && <> · <HistoryBadge badge={match.historyBadge} /></>}
      </p>
      <p><AmountBadge indicator={match.indicators.economic} /></p>
    </article>
  );
}
