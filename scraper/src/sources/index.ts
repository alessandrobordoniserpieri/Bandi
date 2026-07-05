// scraper/src/sources/index.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceConfig } from "../pipeline/types";
import { rowToSourceConfig } from "../db/supabase-grants-db";

// Loads the enabled grant_sources rows (the 12 MVP sources once migration 0005 runs) and maps
// each to a SourceConfig the pipeline understands, carrying its scrape_config through.
export async function loadEnabledSources(client: SupabaseClient): Promise<SourceConfig[]> {
  const { data, error } = await client.from("grant_sources").select("*").eq("enabled", true);
  if (error) throw new Error(`loadEnabledSources: ${error.message}`);
  return (data ?? []).map((row) => rowToSourceConfig(row as Record<string, unknown>));
}
