// app/src/lib/profile/__tests__/schema.test.ts
import { describe, it, expect } from "vitest";
import {
  identitySchema, themesSchema, territorySchema, documentsSchema,
  deriveRegion, rowToEntityProfile, parseProjectHistory,
  type ProfileRow,
} from "../schema";

// A fully-populated row used across mapper assertions.
function fullRow(): ProfileRow {
  return {
    id: "p1", user_id: "u1",
    name: "ASD Test", legal_type: "APS - Associazione di Promozione Sociale",
    founded_year: 2015, tax_code: "01234567890", website: "https://x.it",
    province: "MI", region: "Lombardia", municipality: "Milano",
    operating_scope: "regionale", operating_provinces: ["MB", "VA"],
    themes: ["Sport", "Giovani"], activity_description: "attività",
    beneficiaries: ["giovani", "minori"],
    stable_staff: "3-10", dedicated_admin: true, funded_projects_3y: "1-2",
    reporting_experience: "qualche_volta", annual_budget: "20-100k", eu_project: false,
    doc_statuto: true, doc_bilancio: true, doc_runts: false, doc_rasd: false,
    doc_durc: false, doc_certificazioni: false, sport_body: null, rasd_number: null,
    public_partners: true, public_partners_detail: "Comune", private_partners: false,
    private_partners_detail: null, networks: null, coprogettazione: false,
    project_history: [
      { grant_name: "Bando X", provider_id: "prov1", year: 2022,
        outcome: "finanziato", amount: 5000, kind: "pubblico" },
    ],
    public_funds: true, private_funds: false, eu_funds: true,
    cofunding_capacity: 20, income_sources: ["donazioni"],
    contact_name: null, contact_role: null, contact_email: null,
    contact_phone: null, notes: null,
    created_at: "2026-07-04T00:00:00Z", updated_at: "2026-07-04T00:00:00Z",
  };
}

describe("deriveRegion", () => {
  it("maps a sample of provinces to their region (I9)", () => {
    expect(deriveRegion("MI")).toBe("Lombardia");
    expect(deriveRegion("RM")).toBe("Lazio");
    expect(deriveRegion("NA")).toBe("Campania");
    expect(deriveRegion("TO")).toBe("Piemonte");
    expect(deriveRegion("PA")).toBe("Sicilia");
  });
  it("returns '' for an unknown province code", () => {
    expect(deriveRegion("ZZ")).toBe("");
  });
});

describe("validation vocabularies", () => {
  it("rejects a legal type outside the 62 LEGAL_TYPES", () => {
    const r = identitySchema.safeParse({ name: "X", legal_type: "Fake Type" });
    expect(r.success).toBe(false);
  });
  it("accepts a valid legal type", () => {
    const r = identitySchema.safeParse({
      name: "X", legal_type: "APS - Associazione di Promozione Sociale",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a tag outside the 47 TAGS", () => {
    const r = themesSchema.safeParse({ themes: ["NotATag"], beneficiaries: [] });
    expect(r.success).toBe(false);
  });
  it("rejects an empty themes list", () => {
    const r = themesSchema.safeParse({ themes: [], beneficiaries: [] });
    expect(r.success).toBe(false);
  });
  it("rejects a province outside PROVINCES", () => {
    const r = territorySchema.safeParse({ province: "ZZ", operating_provinces: [] });
    expect(r.success).toBe(false);
  });
});

describe("rowToEntityProfile", () => {
  it("maps the scoring subset with derived fields", () => {
    const p = rowToEntityProfile(fullRow());
    expect(p.legalType).toBe("APS - Associazione di Promozione Sociale");
    expect(p.province).toBe("MI");
    expect(p.region).toBe("Lombardia");
    expect(p.operatingProvinces).toEqual(["MB", "VA"]);
    expect(p.themes).toEqual(["Sport", "Giovani"]);
    expect(p.documents).toEqual({
      statuto: true, bilancio: true, runts: false,
      rasd: false, durc: false, certificazioni: false,
    });
    expect(p.publicPartners).toBe(true);
    expect(p.privatePartners).toBe(false);
    expect(p.cofundingCapacity).toBe(20);
  });

  it("derives fundingTypesReceived from the three booleans (only true ones)", () => {
    const p = rowToEntityProfile(fullRow());
    expect(p.fundingTypesReceived).toEqual(["pubblico", "eu"]);
  });

  it("builds capacity answers when all 6 are present", () => {
    const p = rowToEntityProfile(fullRow());
    expect(p.capacity).toEqual({
      stableStaff: "3-10", dedicatedAdmin: true, fundedProjects3y: "1-2",
      reportingExperience: "qualche_volta", annualBudget: "20-100k", euProject: false,
    });
  });

  it("returns capacity null when any of the 6 answers is missing", () => {
    const row = fullRow();
    row.eu_project = null;
    expect(rowToEntityProfile(row).capacity).toBeNull();
  });

  it("builds a non-null capacity when dedicated_admin and eu_project are both false (false counts as answered)", () => {
    const row = fullRow();
    row.dedicated_admin = false;
    row.eu_project = false;
    const p = rowToEntityProfile(row);
    expect(p.capacity).toEqual({
      stableStaff: "3-10", dedicatedAdmin: false, fundedProjects3y: "1-2",
      reportingExperience: "qualche_volta", annualBudget: "20-100k", euProject: false,
    });
  });

  it("converts project_history jsonb rows snake_case → camelCase", () => {
    const p = rowToEntityProfile(fullRow());
    expect(p.projectHistory).toEqual([
      { grantName: "Bando X", providerId: "prov1", year: 2022,
        outcome: "finanziato", amount: 5000, kind: "pubblico" },
    ]);
  });
});

describe("parseProjectHistory", () => {
  it("returns [] for non-array / malformed input", () => {
    expect(parseProjectHistory(null)).toEqual([]);
    expect(parseProjectHistory("{}")).toEqual([]);
    expect(parseProjectHistory([{ nope: 1 }])).toEqual([]);
  });
});

describe("documentsSchema", () => {
  it("accepts a payload with the RASD fields plus the always-on doc booleans", () => {
    const r = documentsSchema.safeParse({
      doc_statuto: true, doc_bilancio: true, doc_runts: false,
      doc_rasd: true, doc_durc: false, doc_certificazioni: true,
      sport_body: "FIGC", rasd_number: "12345",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.doc_rasd).toBe(true);
      expect(r.data.sport_body).toBe("FIGC");
      expect(r.data.rasd_number).toBe("12345");
    }
  });
});
