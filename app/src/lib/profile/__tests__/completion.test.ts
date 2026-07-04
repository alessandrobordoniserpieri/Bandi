import { describe, it, expect } from "vitest";
import { profileCompletion } from "../completion";
import type { ProfileRow } from "../schema";

function emptyRow(): ProfileRow {
  return {
    id: "p1", user_id: "u1",
    name: null, legal_type: null, founded_year: null, tax_code: null, website: null,
    province: null, region: null, municipality: null, operating_scope: null,
    operating_provinces: [], themes: [], activity_description: null, beneficiaries: [],
    stable_staff: null, dedicated_admin: null, funded_projects_3y: null,
    reporting_experience: null, annual_budget: null, eu_project: null,
    doc_statuto: false, doc_bilancio: false, doc_runts: false, doc_rasd: false,
    doc_durc: false, doc_certificazioni: false, sport_body: null, rasd_number: null,
    public_partners: false, public_partners_detail: null, private_partners: false,
    private_partners_detail: null, networks: null, coprogettazione: false,
    project_history: [], public_funds: false, private_funds: false, eu_funds: false,
    cofunding_capacity: null, income_sources: [],
    contact_name: null, contact_role: null, contact_email: null,
    contact_phone: null, notes: null,
    created_at: "2026-07-04T00:00:00Z", updated_at: "2026-07-04T00:00:00Z",
  };
}

function withEssentials(row: ProfileRow): ProfileRow {
  return { ...row, name: "X", legal_type: "ONLUS", province: "MI", themes: ["Sport"] };
}

describe("profileCompletion", () => {
  it("empty profile → 0%", () => {
    expect(profileCompletion(emptyRow()).percent).toBe(0);
  });

  it("only the 3 essential sections → 68%", () => {
    expect(profileCompletion(withEssentials(emptyRow())).percent).toBe(68);
  });

  it("essentials + capacity → 82%", () => {
    const row = withEssentials(emptyRow());
    Object.assign(row, {
      stable_staff: "3-10", dedicated_admin: true, funded_projects_3y: "1-2",
      reporting_experience: "mai", annual_budget: "<20k", eu_project: false,
    });
    expect(profileCompletion(row).percent).toBe(82);
  });

  it("essentials + documents (≥1 doc) → 80%", () => {
    const row = withEssentials(emptyRow());
    row.doc_statuto = true;
    expect(profileCompletion(row).percent).toBe(80);
  });

  it("all six weighted sections filled → 100%", () => {
    const row = withEssentials(emptyRow());
    Object.assign(row, {
      stable_staff: "3-10", dedicated_admin: true, funded_projects_3y: "1-2",
      reporting_experience: "mai", annual_budget: "<20k", eu_project: false,
      doc_statuto: true,
      project_history: [{ grant_name: "B", provider_id: null, year: null,
        outcome: "finanziato", amount: null, kind: null }],
    });
    expect(profileCompletion(row).percent).toBe(100);
  });

  it("suggestions cover unfilled weighted sections, sorted by points desc", () => {
    const { suggestions } = profileCompletion(withEssentials(emptyRow()));
    expect(suggestions.map((s) => s.section)).toEqual(["capacity", "documents", "history"]);
    expect(suggestions[0].points).toBe(14);
    expect(suggestions[0].message).toBe(
      "Compila la capacità gestionale per sbloccare 14 punti di matching",
    );
  });

  it("a complete profile has no suggestions", () => {
    const row = withEssentials(emptyRow());
    Object.assign(row, {
      stable_staff: "3-10", dedicated_admin: true, funded_projects_3y: "1-2",
      reporting_experience: "mai", annual_budget: "<20k", eu_project: false,
      doc_statuto: true,
      project_history: [{ grant_name: "B", provider_id: null, year: null,
        outcome: "finanziato", amount: null, kind: null }],
    });
    expect(profileCompletion(row).suggestions).toEqual([]);
  });
});
