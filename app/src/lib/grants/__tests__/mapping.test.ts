import { describe, it, expect } from "vitest";
import { mapGrantRow, type GrantRowWithProvider } from "../mapping";

function row(overrides: Partial<GrantRowWithProvider> = {}): GrantRowWithProvider {
  return {
    id: "g1", title: "Bando Sport 2026", provider_id: "prov1",
    deadline: "2026-12-31", status: "aperto", amount: 50000, cofunding_required: 20,
    eligible_types: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
    area: "Lombardia", geo_scope: "regionale", complexity: "media",
    required_documents: ["statuto", "bilancio"],
    grant_type: "bando",
    summary: null, requirements: null, beneficiaries: null,
    cofunding_percentage: null, opening_date: null, funding_type: null,
    min_amount: null, max_amount: null, eligible_expenses: null,
    application_method: null, contact_info: null, attachments: [],
    detail_fetched_at: null, detail_fetch_attempts: 0,
    url: "https://example.it/bando", source_id: null, raw: null, import_mode: "scraper",
    discovered_at: "2026-07-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    provider: { name: "Fondazione Test", kind: "privato" },
    ...overrides,
  };
}

describe("mapGrantRow", () => {
  it("maps columns to the matching Grant and lifts provider kind + name", () => {
    const { grant, providerName } = mapGrantRow(row());
    expect(grant.id).toBe("g1");
    expect(grant.providerId).toBe("prov1");
    expect(grant.providerKind).toBe("privato");
    expect(providerName).toBe("Fondazione Test");
    expect(grant.status).toBe("aperto");
    expect(grant.geoScope).toBe("regionale");
    expect(grant.requiredDocuments).toEqual(["statuto", "bilancio"]);
  });

  it("coalesces nullable text (summary/requirements/beneficiaries) to empty string", () => {
    const { grant } = mapGrantRow(row());
    expect(grant.summary).toBe("");
    expect(grant.requirements).toBe("");
    expect(grant.beneficiaries).toBe("");
  });

  it("handles a missing provider (null join) → providerKind null, providerName null", () => {
    const { grant, providerName } = mapGrantRow(row({ provider: null, provider_id: null }));
    expect(grant.providerKind).toBeNull();
    expect(providerName).toBeNull();
    expect(grant.providerId).toBeNull();
  });

  it("passes nullable scalars through as null (amount/cofunding/deadline/area/geo/complexity)", () => {
    const { grant } = mapGrantRow(row({
      amount: null, cofunding_required: null, deadline: null,
      area: null, geo_scope: null, complexity: null,
    }));
    expect(grant.amount).toBeNull();
    expect(grant.cofundingRequired).toBeNull();
    expect(grant.deadline).toBeNull();
    expect(grant.area).toBeNull();
    expect(grant.geoScope).toBeNull();
    expect(grant.complexity).toBeNull();
  });

  it("maps valid attachment entries and drops malformed ones (never crashes on bad jsonb)", () => {
    const { grant } = mapGrantRow(row({
      attachments: [
        { title: "Bando.pdf", url: "https://x/b.pdf", mimeType: "application/pdf" },
        { title: "Senza url" },
        { url: "https://x/senza-titolo.pdf" },
        "una stringa qualsiasi",
        null,
        { title: "Senza mimeType", url: "https://x/c.pdf" },
      ],
    }));
    expect(grant.attachments).toEqual([
      { title: "Bando.pdf", url: "https://x/b.pdf", mimeType: "application/pdf" },
      { title: "Senza mimeType", url: "https://x/c.pdf", mimeType: null },
    ]);
  });

  it("defaults attachments to [] when the column is null or not an array", () => {
    expect(mapGrantRow(row({ attachments: null })).grant.attachments).toEqual([]);
  });

  it("maps grant_type to grantType", () => {
    expect(mapGrantRow(row({ grant_type: "co_progettazione" })).grant.grantType).toBe("co_progettazione");
  });
});
