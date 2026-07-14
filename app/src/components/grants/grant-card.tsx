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
    <article
      data-density={density}
      className="group relative flex gap-4 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 hover:border-border-hover hover:shadow-[var(--shadow-md)] motion-reduce:transition-none group-data-[density=compact]:gap-3 data-[density=compact]:gap-3 data-[density=compact]:p-3"
    >
      {/* Score column — the primary information (score-first hierarchy). Number + a verdict-colored
          bar, deliberately not a ring (anti-gamification). */}
      <div
        className="flex w-16 shrink-0 flex-col gap-1.5 group-data-[density=compact]:w-12"
        aria-label={`Punteggio di compatibilità: ${match.score} su 100`}
      >
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-text group-data-[density=compact]:text-lg">
            {match.score}
          </span>
          <span className="text-xs text-text-muted">/100</span>
        </div>
        <div className="score-bar">
          <div className="score-bar-fill" data-verdict={match.verdict} style={{ width: `${match.score}%` }} />
        </div>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="text-[0.9375rem] font-medium leading-snug text-balance group-data-[density=compact]:text-[0.8125rem]">
          {/* Stretched link: the whole card is the click target, badges stay above it. */}
          <Link
            href={`/bandi/${grant.id}`}
            className="rounded-sm text-text no-underline outline-none transition-colors before:absolute before:inset-0 before:content-[''] hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {grant.title}
          </Link>
        </h3>
        {providerName && (
          <p className="text-sm text-text-muted group-data-[density=compact]:hidden">{providerName}</p>
        )}
        <div className="relative flex flex-wrap items-center gap-1.5">
          <VerdictBadge verdict={match.verdict} />
          <DeadlineBadge indicator={match.indicators.deadline} />
          {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
        </div>
        <div className="relative pt-0.5 group-data-[density=compact]:hidden">
          <AmountBadge indicator={match.indicators.economic} />
        </div>
      </div>
    </article>
  );
}
