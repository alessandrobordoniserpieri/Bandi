// Render smoke test for the Task 5 profile section components (4-8).
//
// Confirms the FormData `name` contract that `readSection` in
// src/lib/profile/actions.ts relies on actually reaches the rendered
// HTML. Uses `renderToStaticMarkup` from `react-dom/server` — a static
// SSR render only, so this does NOT exercise onChange/live recompute
// (e.g. the capacity level never updates in this test); it only checks
// what the initial static render produces.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionCapacity } from "../section-capacity";
import { SectionDocuments } from "../section-documents";
import { SectionPartnerships } from "../section-partnerships";
import { SectionHistory } from "../section-history";
import { SectionContacts } from "../section-contacts";

describe("profile section components (4-8) render the FormData name contract", () => {
  it("capacity renders all 6 controlled inputs + calculated-capacity label", () => {
    const html = renderToStaticMarkup(<SectionCapacity />);
    expect(html).toContain('name="stable_staff"');
    expect(html).toContain('name="dedicated_admin"');
    expect(html).toContain('name="funded_projects_3y"');
    expect(html).toContain('name="reporting_experience"');
    expect(html).toContain('name="annual_budget"');
    expect(html).toContain('name="eu_project"');
    expect(html).toContain("Capacità calcolata");
  });

  it("documents renders RASD fields only for a SPORTIVI legal type", () => {
    const sportHtml = renderToStaticMarkup(
      <SectionDocuments legalType="ASD - Associazione Sportiva Dilettantistica" />,
    );
    expect(sportHtml).toContain('name="doc_rasd"');
    expect(sportHtml).toContain('name="sport_body"');
    expect(sportHtml).toContain('name="rasd_number"');
    // Always-on document checkboxes are present regardless of legal type.
    expect(sportHtml).toContain('name="doc_statuto"');

    const nonSportHtml = renderToStaticMarkup(<SectionDocuments legalType="ONLUS" />);
    expect(nonSportHtml).not.toContain('name="doc_rasd"');
    expect(nonSportHtml).not.toContain('name="sport_body"');
    expect(nonSportHtml).not.toContain('name="rasd_number"');
    expect(nonSportHtml).toContain('name="doc_statuto"');
  });

  it("history renders the hidden project_history JSON input + finance fields", () => {
    const html = renderToStaticMarkup(<SectionHistory />);
    expect(html).toContain('name="project_history"');
    expect(html).toContain('name="public_funds"');
    expect(html).toContain('name="cofunding_capacity"');
    expect(html).toContain('name="income_sources"');
  });

  // Concept §6.3: raw snake_case tokens (e.g. "quote_associative") must never be the visible
  // label — only the persisted <input value> may carry the raw token.
  it("history shows readable Italian labels for income sources, not raw snake_case", () => {
    const html = renderToStaticMarkup(<SectionHistory />);
    expect(html).toContain("Quote associative");
    expect(html).toContain("Contributi pubblici");
    expect(html).toContain("Attività commerciale");
    expect(html).not.toMatch(/>quote_associative</);
    expect(html).not.toMatch(/>contributi_pubblici</);
    expect(html).not.toMatch(/>attivita_commerciale</);
  });

  it("partnerships renders public/private partner + coprogettazione inputs", () => {
    const html = renderToStaticMarkup(<SectionPartnerships />);
    expect(html).toContain('name="public_partners"');
    expect(html).toContain('name="private_partners"');
    expect(html).toContain('name="coprogettazione"');
  });

  it("contacts renders contact_email + notes inputs", () => {
    const html = renderToStaticMarkup(<SectionContacts />);
    expect(html).toContain('name="contact_email"');
    expect(html).toContain('name="notes"');
  });
});
