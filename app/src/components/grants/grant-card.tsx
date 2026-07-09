import Link from "next/link";
import type { MatchedGrant } from "@/lib/grants/match-list";
import type { DensityMode } from "@/lib/grants/view-density";
import { DeadlineBadge } from "./deadline-badge";
import { VerdictBadge } from "./verdict-badge";
import { AmountBadge } from "./amount-badge";
import { HistoryBadge } from "./history-badge";

export function GrantCard({
  matched,
  density = "card",
}: {
  matched: MatchedGrant;
  density?: DensityMode;
}) {
  const { grant, providerName, match } = matched;
  return (
    <article className="grant-card" data-density={density}>
      <div className="grant-card-score-block" aria-label={`Punteggio di compatibilità: ${match.score} su 100`}>
        <div className="grant-card-score-number">
          <span className="grant-card-score">{match.score}</span>
          <span className="grant-card-score-max">/100</span>
        </div>
        <div className="score-bar">
          <div
            className="score-bar-fill"
            data-verdict={match.verdict}
            style={{ width: `${match.score}%` }}
          />
        </div>
      </div>
      <div className="grant-card-body">
        <h3><Link href={`/bandi/${grant.id}`}>{grant.title}</Link></h3>
        {providerName && <p className="grant-card-provider">{providerName}</p>}
        <p className="grant-card-meta">
          <VerdictBadge verdict={match.verdict} />
          <DeadlineBadge indicator={match.indicators.deadline} />
          {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
        </p>
        <p className="grant-card-meta"><AmountBadge indicator={match.indicators.economic} /></p>
      </div>
    </article>
  );
}
