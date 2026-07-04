// Render smoke test for the Task 7 SectionForm wrapper.
//
// Confirms SectionForm renders its children inside a real <form> with a
// submit button, using the actual SectionIdentity component as the child
// (the same shape it wraps in profilo/page.tsx). Uses `renderToStaticMarkup`
// from `react-dom/server` — no testing-library or jsdom needed for this
// SSR-only smoke check. The page itself is an async Server Component that
// hits Supabase, so it is deliberately not rendered here; `next build` is
// the real gate for that.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionForm } from "../section-form";
import { SectionIdentity } from "@/components/profile/section-identity";

describe("SectionForm", () => {
  it("renders a form wrapping its children with a submit button", () => {
    const html = renderToStaticMarkup(
      <SectionForm section="identity">
        <SectionIdentity />
      </SectionForm>,
    );
    expect(html).toContain("<form");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="legal_type"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Salva sezione");
  });
});
