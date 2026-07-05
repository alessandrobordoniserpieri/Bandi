// scraper/src/db/supabase-grants-db.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedGrant, GrantsDb, SourceConfig, StoredGrant } from "../pipeline/types";
import type { GeoScope, Complexity, GrantStatus } from "../pipeline/vocab";

// grants.status is NOT NULL with default 'aperto'; a scraped grant may have a null status, so
// we coalesce on write rather than sending an explicit null (which would violate the column).
const DEFAULT_STATUS: GrantStatus = "aperto";

type GrantInsertRow = Record<string, unknown>;

// ExtractedGrant (camelCase) -> grants row (snake_case) for an insert.
export function grantToInsertRow(grant: ExtractedGrant): GrantInsertRow {
  return {
    title: grant.title,
    url: grant.url,
    provider_id: grant.providerId,
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
  };
}

const COLUMN_OF: Record<keyof ExtractedGrant, string> = {
  title: "title", url: "url", providerId: "provider_id", deadline: "deadline", status: "status",
  amount: "amount", cofundingRequired: "cofunding_required", eligibleTypes: "eligible_types",
  tags: "tags", area: "area", geoScope: "geo_scope", complexity: "complexity",
  requiredDocuments: "required_documents", summary: "summary", requirements: "requirements",
  beneficiaries: "beneficiaries",
};

// A dedup patch (only changed fields) -> snake_case row, coalescing a null status and always
// bumping updated_at so the row reflects the rerun.
export function patchToUpdateRow(patch: Partial<ExtractedGrant>): GrantInsertRow {
  const row: GrantInsertRow = {};
  for (const key of Object.keys(patch) as (keyof ExtractedGrant)[]) {
    const value = patch[key];
    row[COLUMN_OF[key]] = key === "status" ? (value ?? DEFAULT_STATUS) : value;
  }
  row.updated_at = new Date().toISOString();
  return row;
}

// grants row (snake_case) -> StoredGrant (camelCase). Arrays are NOT NULL in the schema;
// nullable text/enum columns pass through as null.
export function rowToStoredGrant(row: Record<string, unknown>): StoredGrant {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    providerId: (row.provider_id as string | null) ?? null,
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
  };
}

// grant_sources row -> SourceConfig, carrying scrape_config through as scrapeConfig.
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

// GrantsDb backed by a service-role Supabase client. Used in production (cron + CLI).
export class SupabaseGrantsDb implements GrantsDb {
  constructor(private readonly client: SupabaseClient) {}

  async findByUrl(normalizedUrl: string): Promise<StoredGrant | null> {
    const { data, error } = await this.client
      .from("grants").select("*").eq("url", normalizedUrl).maybeSingle();
    fail("findByUrl", error);
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
}
