import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SupabaseGrantsDb,
  grantToInsertRow,
  patchToUpdateRow,
  rowToStoredGrant,
  rowToSourceConfig,
} from "../src/db/supabase-grants-db";
import { StubSupabaseClient } from "./helpers/supabase-stub";
import type { ExtractedGrant } from "../src/pipeline/types";

const grant: ExtractedGrant = {
  title: "Bando A", url: "https://x/1", providerId: "p1", sourceId: "s1", deadline: "2026-12-31",
  status: null, grantType: "bando", amount: 5000, cofundingRequired: null,
  eligibleTypes: ["ONLUS"], tags: ["sport"], area: "Roma", geoScope: "nazionale",
  complexity: null, requiredDocuments: ["statuto"], summary: null, requirements: "req", beneficiaries: null,
  openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
};

const asClient = (s: StubSupabaseClient) => s as unknown as SupabaseClient;

describe("grantToInsertRow", () => {
  it("maps camelCase to snake_case and coalesces a null status to 'aperto'", () => {
    const row = grantToInsertRow(grant);
    expect(row).toMatchObject({
      title: "Bando A", url: "https://x/1", provider_id: "p1", deadline: "2026-12-31",
      status: "aperto", amount: 5000, cofunding_required: null,
      eligible_types: ["ONLUS"], tags: ["sport"], geo_scope: "nazionale",
      required_documents: ["statuto"], summary: null, requirements: "req", beneficiaries: null,
    });
  });
  it("keeps an explicit status", () => {
    expect(grantToInsertRow({ ...grant, status: "chiuso" }).status).toBe("chiuso");
  });
  it("maps grantType to the grant_type column", () => {
    expect(grantToInsertRow({ ...grant, grantType: "co_progettazione" }).grant_type).toBe("co_progettazione");
  });
  it("maps attachments to the jsonb column on insert and patch", () => {
    const attachments = [{ title: "Bando.pdf", url: "https://x/b.pdf", mimeType: "application/pdf" }];
    expect(grantToInsertRow({ ...grant, attachments }).attachments).toEqual(attachments);
    // Grants without attachments write an empty array, never undefined/null.
    expect(grantToInsertRow(grant).attachments).toEqual([]);
    expect(patchToUpdateRow({ attachments }).attachments).toEqual(attachments);
  });
});

describe("patchToUpdateRow", () => {
  it("only includes changed keys, maps columns, and bumps updated_at", () => {
    const row = patchToUpdateRow({ amount: 9000, geoScope: "regionale" });
    expect(row.amount).toBe(9000);
    expect(row.geo_scope).toBe("regionale");
    expect(typeof row.updated_at).toBe("string");
    expect(row).not.toHaveProperty("title");
  });
  it("coalesces a null status in a patch", () => {
    expect(patchToUpdateRow({ status: null }).status).toBe("aperto");
  });
});

describe("rowToStoredGrant", () => {
  it("maps a row back to a StoredGrant, defaulting null arrays to []", () => {
    const stored = rowToStoredGrant({
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", amount: null, cofunding_required: null, eligible_types: null,
      tags: ["sport"], area: null, geo_scope: null, complexity: null, required_documents: null,
      summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    });
    expect(stored.id).toBe("g1");
    expect(stored.eligibleTypes).toEqual([]);
    expect(stored.tags).toEqual(["sport"]);
    expect(stored.providerId).toBeNull();
  });

  it("maps detail_fetched_at through, for resolveSourceId's detail-priority check", () => {
    const base = {
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", amount: null, cofunding_required: null, eligible_types: null,
      tags: [], area: null, geo_scope: null, complexity: null, required_documents: null,
      summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    };
    expect(rowToStoredGrant({ ...base, detail_fetched_at: "2026-07-01T00:00:00Z" }).detailFetchedAt)
      .toBe("2026-07-01T00:00:00Z");
    expect(rowToStoredGrant({ ...base, detail_fetched_at: null }).detailFetchedAt).toBeNull();
  });
});

describe("rowToStoredGrant — grant_type", () => {
  it("maps the grant_type column back to grantType", () => {
    const stored = rowToStoredGrant({
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", grant_type: "co_progettazione", amount: null, cofunding_required: null,
      eligible_types: null, tags: [], area: null, geo_scope: null, complexity: null,
      required_documents: null, summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    });
    expect(stored.grantType).toBe("co_progettazione");
  });
  it("defaults grantType to bando when the column is absent (defensive fallback)", () => {
    const stored = rowToStoredGrant({
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", amount: null, cofunding_required: null, eligible_types: null,
      tags: [], area: null, geo_scope: null, complexity: null, required_documents: null,
      summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    });
    expect(stored.grantType).toBe("bando");
  });
});

describe("rowToSourceConfig", () => {
  it("carries scrape_config through as scrapeConfig", () => {
    const src = rowToSourceConfig({ id: "s1", name: "F", url: "https://f", scrape_config: { maxPages: 2 } });
    expect(src).toEqual({ id: "s1", name: "F", url: "https://f", scrapeConfig: { maxPages: 2 } });
  });
  it("omits scrapeConfig when the config is empty", () => {
    const src = rowToSourceConfig({ id: "s1", name: "F", url: "https://f", scrape_config: {} });
    expect(src).toEqual({ id: "s1", name: "F", url: "https://f" });
  });
});

describe("SupabaseGrantsDb", () => {
  it("findByUrl queries grants by url and maps the row", async () => {
    const stub = new StubSupabaseClient({ grants: { data: { id: "g1", title: "T", url: "https://x/1", tags: [], eligible_types: [], required_documents: [] } } });
    const db = new SupabaseGrantsDb(asClient(stub));
    const found = await db.findByUrl("https://x/1");
    expect(found?.id).toBe("g1");
    expect(stub.records.grants!.eq).toEqual([["url", "https://x/1"]]);
    expect(stub.records.grants!.maybeSingle).toBe(true);
  });

  it("findByUrl returns null when no row", async () => {
    const stub = new StubSupabaseClient({ grants: { data: null } });
    expect(await new SupabaseGrantsDb(asClient(stub)).findByUrl("https://x/1")).toBeNull();
  });

  it("insert sends the mapped row to grants", async () => {
    const stub = new StubSupabaseClient({ grants: {} });
    await new SupabaseGrantsDb(asClient(stub)).insert(grant);
    expect((stub.records.grants!.insert as Record<string, unknown>).status).toBe("aperto");
  });

  it("update targets the row id with the patch", async () => {
    const stub = new StubSupabaseClient({ grants: {} });
    await new SupabaseGrantsDb(asClient(stub)).update("g1", { amount: 1 });
    expect((stub.records.grants!.update as Record<string, unknown>).amount).toBe(1);
    expect(stub.records.grants!.eq).toEqual([["id", "g1"]]);
  });

  it("findProviderIdByName returns the id or null", async () => {
    const found = new StubSupabaseClient({ grant_providers: { data: { id: "p9" } } });
    expect(await new SupabaseGrantsDb(asClient(found)).findProviderIdByName("Fondazione")).toBe("p9");
    const missing = new StubSupabaseClient({ grant_providers: { data: null } });
    expect(await new SupabaseGrantsDb(asClient(missing)).findProviderIdByName("Ignota")).toBeNull();
  });

  it("findProviderIdByName also matches by alias, not just the canonical name (ADR-005)", async () => {
    const stub = new StubSupabaseClient({ grant_providers: { data: { id: "p9" } } });
    await new SupabaseGrantsDb(asClient(stub)).findProviderIdByName("Sport e Salute");
    expect(stub.records.grant_providers!.or).toEqual(["name.eq.Sport e Salute,aliases.cs.{Sport e Salute}"]);
  });

  it("updateSource writes last_run_at / last_error by id", async () => {
    const stub = new StubSupabaseClient({ grant_sources: {} });
    await new SupabaseGrantsDb(asClient(stub)).updateSource("s1", { lastRunAt: "2026-07-05T00:00:00Z", lastError: null });
    expect(stub.records.grant_sources!.update).toEqual({ last_run_at: "2026-07-05T00:00:00Z", last_error: null });
    expect(stub.records.grant_sources!.eq).toEqual([["id", "s1"]]);
  });

  it("throws when the client returns an error", async () => {
    const stub = new StubSupabaseClient({ grants: { error: { message: "boom" } } });
    await expect(new SupabaseGrantsDb(asClient(stub)).insert(grant)).rejects.toThrow(/boom/);
  });
});
