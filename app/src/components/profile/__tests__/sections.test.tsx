// Render smoke test for the Task 4 profile section components.
//
// Confirms the FormData `name` contract that `readSection` in
// src/lib/profile/actions.ts relies on actually reaches the rendered
// HTML (not just that the components are defined functions). Uses
// `renderToStaticMarkup` from `react-dom/server` — no testing-library
// or jsdom needed for this SSR-only smoke check.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionIdentity } from "../section-identity";
import { SectionTerritory } from "../section-territory";
import { SectionThemes } from "../section-themes";

describe("profile section components render the FormData name contract", () => {
  it("identity renders name + legal_type inputs", () => {
    const html = renderToStaticMarkup(<SectionIdentity />);
    expect(html).toContain('name="name"');
    expect(html).toContain('name="legal_type"');
  });

  it("territory renders province + operating_provinces and no submitted region", () => {
    const html = renderToStaticMarkup(<SectionTerritory />);
    expect(html).toContain('name="province"');
    expect(html).toContain('name="operating_provinces"');
    // Invariant I9: region is derived server-side and must never be a
    // submittable form field — the input has no `name` attribute at all.
    expect(html).not.toContain('name="region"');
    expect(html).toContain('readOnly=""');
  });

  it("themes renders themes + beneficiaries multi-selects", () => {
    const html = renderToStaticMarkup(<SectionThemes />);
    expect(html).toContain('name="themes"');
    expect(html).toContain('name="beneficiaries"');
  });
});
