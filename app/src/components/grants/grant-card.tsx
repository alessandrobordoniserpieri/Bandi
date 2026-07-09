import Link from "next/link";
import type { MatchedGrant } from "@/lib/grants/match-list";
import { DeadlineBadge } from "./deadline-badge";
import { VerdictBadge } from "./verdict-badge";
import { AmountBadge } from "./amount-badge";
import { HistoryBadge } from "./history-badge";

export function GrantCard({ matched }: { matched: MatchedGrant }) {
  const { grant, providerName, match } = matched;
  return (
    <article className="grant-card">
      <h3><Link href={`/bandi/${grant.id}`}>{grant.title}</Link></h3>
      {providerName && <p className="grant-card-provider">{providerName}</p>}
      <p className="grant-card-meta">
        <DeadlineBadge indicator={match.indicators.deadline} />
        <span className="grant-card-score">{match.score}</span><span>/100</span>
        <VerdictBadge verdict={match.verdict} />
        {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
      </p>
      <p className="grant-card-meta"><AmountBadge indicator={match.indicators.economic} /></p>
    </article>
  );
}
