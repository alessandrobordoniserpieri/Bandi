// scraper/src/sources/index.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceConfig } from "../pipeline/types";
import { rowToSourceConfig } from "../db/supabase-grants-db";

// Priority-first, least-recently-run tiebreaker. A run cut short by the time budget leaves the
// unreached sources with an older last_run_at, so they rise to the top of the next run — a
// self-balancing round-robin within each priority band. Hard priority means a low-priority
// source can stay behind under sustained overload; that is the intended meaning of "low".
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function priorityRank(row: Record<string, unknown>): number {
  const p = typeof row.priority === "string" ? row.priority : "medium";
  return PRIORITY_RANK[p] ?? 2; // unknown/missing → medium (the middle band)
}

function lastRunAt(row: Record<string, unknown>): string | null {
  const v = row.last_run_at;
  return typeof v === "string" && v !== "" ? v : null;
}

// priority desc, then last_run_at asc with nulls first (never-run sources go before scraped ones).
function compareSources(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const byPriority = priorityRank(b) - priorityRank(a);
  if (byPriority !== 0) return byPriority;
  const la = lastRunAt(a);
  const lb = lastRunAt(b);
  if (la === lb) return 0;
  if (la === null) return -1;
  if (lb === null) return 1;
  return la < lb ? -1 : 1;
}

// Loads the enabled grant_sources rows and maps each to a SourceConfig the pipeline understands,
// carrying its scrape_config through. Ordering is applied here (see compareSources) rather than in
// SQL because the priority enum has no usable natural order.
export async function loadEnabledSources(client: SupabaseClient): Promise<SourceConfig[]> {
  const { data, error } = await client.from("grant_sources").select("*").eq("enabled", true);
  if (error) throw new Error(`loadEnabledSources: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.slice().sort(compareSources).map(rowToSourceConfig);
}
