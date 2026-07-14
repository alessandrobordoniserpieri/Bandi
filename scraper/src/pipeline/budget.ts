// scraper/src/pipeline/budget.ts

// A conservative wall-clock budget for a single scrape invocation. Vercel hard-kills the function
// at maxDuration (300s); we set a soft total below that (e.g. 270s) and never START a unit of work
// unless there is time left for its WORST case (one LLM call + retries + throttle). That way a call
// can never be in flight across the hard limit — the check is "hasTimeFor(worstCase)", not "any
// time left". Work skipped by the budget is not lost: unscraped sources rise to the top of the next
// run (priority + last_run_at ordering) and un-enriched grants stay stale for findGrantsNeedingDetail.
export interface Budget {
  // True when at least worstCaseMs remain before the soft deadline.
  hasTimeFor(worstCaseMs: number): boolean;
  remainingMs(): number;
}

export function createBudget(totalMs: number, now: () => number = Date.now): Budget {
  const deadline = now() + totalMs;
  return {
    remainingMs: () => deadline - now(),
    hasTimeFor: (worstCaseMs: number) => now() + worstCaseMs <= deadline,
  };
}

// Used when no budget is configured (manual runs, tests): never truncates.
export const UNLIMITED_BUDGET: Budget = {
  hasTimeFor: () => true,
  remainingMs: () => Number.POSITIVE_INFINITY,
};
