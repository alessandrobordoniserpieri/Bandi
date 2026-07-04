// Render smoke test for the Task 6 onboarding wizard.
//
// Confirms the initial static render shows step 1 of 3 and that all three
// sections' inputs are mounted in the markup (earlier/later steps are only
// `hidden`, not unmounted, so their inputs still post on final submit).
// Uses `renderToStaticMarkup` from `react-dom/server` — no testing-library
// or jsdom needed for this SSR-only smoke check.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingWizard } from "../wizard";

describe("OnboardingWizard initial render", () => {
  it("shows step 1 of 3 (Identità)", () => {
    const html = renderToStaticMarkup(<OnboardingWizard />);
    expect(html).toContain("Passo 1 di 3");
    expect(html).toContain("Identità");
  });

  it("mounts the identity section inputs", () => {
    const html = renderToStaticMarkup(<OnboardingWizard />);
    expect(html).toContain('name="name"');
    expect(html).toContain('name="legal_type"');
  });

  it("mounts territory and themes inputs even though hidden on step 1", () => {
    const html = renderToStaticMarkup(<OnboardingWizard />);
    expect(html).toContain('name="province"');
    expect(html).toContain('name="themes"');
  });
});
