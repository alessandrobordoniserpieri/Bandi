-- 0010: Source scheduling — priority for ordering when a run is cut short by the time budget.
-- Sources are processed priority-first (high → medium → low); within a band, least-recently-run
-- first (last_run_at asc, nulls first) so a source starved by the budget rises to the top next run.
-- The ordering itself lives in loadEnabledSources (JS): enum alphabetical order would be wrong
-- ('high' < 'low' < 'medium'), and last_run_at is a nulls-first tiebreaker.

CREATE TYPE source_priority AS ENUM ('high', 'medium', 'low');

ALTER TABLE public.grant_sources
  ADD COLUMN IF NOT EXISTS priority source_priority NOT NULL DEFAULT 'medium';
