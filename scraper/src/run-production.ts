// scraper/src/run-production.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedGrant, GrantsDb, PipelineResult, ScrapeLogEntry, StoredGrant } from "./pipeline/types";
import { getProvider } from "./providers";
import { throttleProvider } from "./providers/throttle-provider";
import { BrowserlessFetcher } from "./pipeline/browserless-fetcher";
import { SupabaseGrantsDb } from "./db/supabase-grants-db";
import { loadEnabledSources } from "./sources";
import { runPipeline } from "./pipeline/run";

export interface ScrapeOptions {
  source?: string;   // filter to a single source by name or id
  dryRun?: boolean;  // read+extract but do not write to the DB
}

export function parseScrapeArgs(argv: string[]): ScrapeOptions {
  const options: ScrapeOptions = {};
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--source=")) options.source = arg.slice("--source=".length);
  }
  return options;
}

class DryRunGrantsDb implements GrantsDb {
  private readonly real: SupabaseGrantsDb;
  constructor(client: SupabaseClient) {
    this.real = new SupabaseGrantsDb(client);
  }
  findByUrl(url: string): Promise<StoredGrant | null> {
    return this.real.findByUrl(url);
  }
  findActiveByUrl(url: string): Promise<StoredGrant | null> {
    return this.real.findActiveByUrl(url);
  }
  async insert(grant: ExtractedGrant): Promise<void> {
    console.log(`[dry-run] insert "${grant.title}" <${grant.url}> tags=${grant.tags.join(",")}`);
  }
  async update(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    console.log(`[dry-run] update ${id}`, patch);
  }
  findProviderIdByName(name: string): Promise<string | null> {
    return this.real.findProviderIdByName(name);
  }
  async updateSource(): Promise<void> { /* no-op */ }
  async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
    console.log(`[dry-run] log ${entry.phase}: +${entry.inserted} ~${entry.updated} =${entry.skipped} (${entry.durationMs}ms)`);
  }
  async markDetailFetched(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    console.log(`[dry-run] markDetailFetched ${id}`, Object.keys(patch));
  }
  findGrantsNeedingDetail(sourceId: string, staleDays: number): Promise<StoredGrant[]> {
    return this.real.findGrantsNeedingDetail(sourceId, staleDays);
  }
}

function required(env: Record<string, string | undefined>, keys: string[]): void {
  const missing = keys.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
}

export async function runProductionScrape(
  env: Record<string, string | undefined> = process.env,
  options: ScrapeOptions = {},
): Promise<PipelineResult[]> {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  required({ ...env, SUPABASE_URL: supabaseUrl }, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BROWSERLESS_API_KEY"]);

  const client = createClient(supabaseUrl!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Single throttle gate over EVERY LLM call (listing chunks + detail), so the provider rate limit
  // (Gemini free ~15 req/min) is respected by construction across the whole pipeline, not just the
  // detail phase. Default 5s ≈ 12 req/min. Tune via LLM_THROTTLE_MS.
  const throttleMs = Number(env.LLM_THROTTLE_MS ?? "5000");
  const llm = throttleProvider(getProvider(env), Number.isFinite(throttleMs) ? throttleMs : 5000);
  const fetcher = new BrowserlessFetcher({ apiKey: env.BROWSERLESS_API_KEY!, baseUrl: env.BROWSERLESS_URL });
  const db: GrantsDb = options.dryRun ? new DryRunGrantsDb(client) : new SupabaseGrantsDb(client);

  let sources = await loadEnabledSources(client);
  if (options.source) {
    sources = sources.filter((s) => s.name === options.source || s.id === options.source);
  }
  return runPipeline(sources, { fetcher, llm, db });
}
