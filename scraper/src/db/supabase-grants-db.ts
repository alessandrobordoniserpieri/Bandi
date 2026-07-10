// scraper/src/db/supabase-grants-db.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedGrant, GrantsDb, ScrapeLogEntry, SourceConfig, StoredGrant } from "../pipeline/types";
import type { GeoScope, Complexity, GrantStatus, FundingType } from "../pipeline/vocab";

const DEFAULT_STATUS: GrantStatus = "aperto";

type GrantInsertRow = Record<string, unknown>;

export function grantToInsertRow(grant: ExtractedGrant): GrantInsertRow {
  return {
    title: grant.title,
    url: grant.url,
    provider_id: grant.providerId,
    source_id: grant.sourceId,
    deadline: grant.deadline,
    status: grant.status ?? DEFAULT_STATUS,
    amount: grant.amount,
    cofunding_required: grant.cofundingRequired,
    eligible_types: grant.eligibleTypes,
    tags: grant.tags,
    area: grant.area,
    geo_scope: grant.geoScope,
    complexity: grant.complexity,
    required_documents: grant.requiredDocuments,
    summary: grant.summary,
    requirements: grant.requirements,
    beneficiaries: grant.beneficiaries,
    opening_date: grant.openingDate,
    funding_type: grant.fundingType,
    min_amount: grant.minAmount,
    max_amount: grant.maxAmount,
    cofunding_percentage: grant.cofundingPercentage,
    eligible_expenses: grant.eligibleExpenses,
    application_method: grant.applicationMethod,
    contact_info: grant.contactInfo,
  };
}

const COLUMN_OF: Record<keyof ExtractedGrant, string> = {
  title: "title", url: "url", providerId: "provider_id", sourceId: "source_id",
  deadline: "deadline", status: "status", amount: "amount",
  cofundingRequired: "cofunding_required", eligibleTypes: "eligible_types",
  tags: "tags", area: "area", geoScope: "geo_scope", complexity: "complexity",
  requiredDocuments: "required_documents", summary: "summary", requirements: "requirements",
  beneficiaries: "beneficiaries",
  openingDate: "opening_date", fundingType: "funding_type",
  minAmount: "min_amount", maxAmount: "max_amount",
  cofundingPercentage: "cofunding_percentage", eligibleExpenses: "eligible_expenses",
  applicationMethod: "application_method", contactInfo: "contact_info",
};

export function patchToUpdateRow(patch: Partial<ExtractedGrant>): GrantInsertRow {
  const row: GrantInsertRow = {};
  for (const key of Object.keys(patch) as (keyof ExtractedGrant)[]) {
    const value = patch[key];
    row[COLUMN_OF[key]] = key === "status" ? (value ?? DEFAULT_STATUS) : value;
  }
  row.updated_at = new Date().toISOString();
  return row;
}

export function rowToStoredGrant(row: Record<string, unknown>): StoredGrant {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    providerId: (row.provider_id as string | null) ?? null,
    sourceId: (row.source_id as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    status: (row.status as GrantStatus | null) ?? null,
    amount: (row.amount as number | null) ?? null,
    cofundingRequired: (row.cofunding_required as number | null) ?? null,
    eligibleTypes: (row.eligible_types as string[] | null) ?? [],
    tags: (row.tags as string[] | null) ?? [],
    area: (row.area as string | null) ?? null,
    geoScope: (row.geo_scope as GeoScope | null) ?? null,
    complexity: (row.complexity as Complexity | null) ?? null,
    requiredDocuments: (row.required_documents as string[] | null) ?? [],
    summary: (row.summary as string | null) ?? null,
    requirements: (row.requirements as string | null) ?? null,
    beneficiaries: (row.beneficiaries as string | null) ?? null,
    openingDate: (row.opening_date as string | null) ?? null,
    fundingType: (row.funding_type as FundingType | null) ?? null,
    minAmount: (row.min_amount as number | null) ?? null,
    maxAmount: (row.max_amount as number | null) ?? null,
    cofundingPercentage: (row.cofunding_percentage as number | null) ?? null,
    eligibleExpenses: (row.eligible_expenses as string | null) ?? null,
    applicationMethod: (row.application_method as string | null) ?? null,
    contactInfo: (row.contact_info as string | null) ?? null,
  };
}

export function rowToSourceConfig(row: Record<string, unknown>): SourceConfig {
  const scrapeConfig = (row.scrape_config as SourceConfig["scrapeConfig"]) ?? undefined;
  return {
    id: String(row.id),
    name: String(row.name),
    url: String(row.url),
    ...(scrapeConfig && Object.keys(scrapeConfig).length > 0 ? { scrapeConfig } : {}),
  };
}

function fail(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`SupabaseGrantsDb.${op}: ${error.message}`);
}

export class SupabaseGrantsDb implements GrantsDb {
  constructor(private readonly client: SupabaseClient) {}

  async findByUrl(normalizedUrl: string): Promise<StoredGrant | null> {
    const { data, error } = await this.client
      .from("grants").select("*").eq("url", normalizedUrl).limit(1).maybeSingle();
    fail("findByUrl", error);
    return data ? rowToStoredGrant(data as Record<string, unknown>) : null;
  }

  async findActiveByUrl(normalizedUrl: string): Promise<StoredGrant | null> {
    const { data, error } = await this.client
      .from("grants").select("*").eq("url", normalizedUrl).neq("status", "scaduto").maybeSingle();
    fail("findActiveByUrl", error);
    return data ? rowToStoredGrant(data as Record<string, unknown>) : null;
  }

  async insert(grant: ExtractedGrant): Promise<void> {
    const { error } = await this.client.from("grants").insert(grantToInsertRow(grant));
    fail("insert", error);
  }

  async update(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    const { error } = await this.client.from("grants").update(patchToUpdateRow(patch)).eq("id", id);
    fail("update", error);
  }

  async findProviderIdByName(name: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("grant_providers").select("id").eq("name", name).maybeSingle();
    fail("findProviderIdByName", error);
    return data ? String((data as Record<string, unknown>).id) : null;
  }

  async updateSource(
    sourceId: string,
    patch: { lastRunAt?: string; lastError?: string | null },
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.lastRunAt !== undefined) row.last_run_at = patch.lastRunAt;
    if (patch.lastError !== undefined) row.last_error = patch.lastError;
    const { error } = await this.client.from("grant_sources").update(row).eq("id", sourceId);
    fail("updateSource", error);
  }

  async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
    const { error } = await this.client.from("scrape_logs").insert({
      source_id: entry.sourceId,
      phase: entry.phase,
      inserted: entry.inserted,
      updated: entry.updated,
      skipped: entry.skipped,
      errors: entry.errors,
      detail_errors: entry.detailErrors,
      duration_ms: entry.durationMs,
    });
    fail("logScrapeRun", error);
  }

  async markDetailFetched(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    const row = patchToUpdateRow(patch);
    row.detail_fetched_at = new Date().toISOString();
    row.detail_fetch_attempts = (row.detail_fetch_attempts as number ?? 0) + 1;
    const { error } = await this.client.from("grants").update(row).eq("id", id);
    fail("markDetailFetched", error);
  }

  async logDebugHtml(sourceId: string, url: string, rawHtml: string, cleanHtml: string): Promise<void> {
    await this.client.from("scrape_debug").insert({
      source_id: sourceId, url, raw_html: rawHtml, clean_html: cleanHtml,
    });
  }

  async findGrantsNeedingDetail(sourceId: string, staleDays: number): Promise<StoredGrant[]> {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);
    const staleIso = staleDate.toISOString();

    const { data, error } = await this.client
      .from("grants")
      .select("*")
      .eq("source_id", sourceId)
      .neq("status", "scaduto")
      .or(`detail_fetched_at.is.null,detail_fetched_at.lt.${staleIso}`)
      .order("created_at", { ascending: true });
    fail("findGrantsNeedingDetail", error);
    return (data as Record<string, unknown>[] ?? []).map(rowToStoredGrant);
  }
}
