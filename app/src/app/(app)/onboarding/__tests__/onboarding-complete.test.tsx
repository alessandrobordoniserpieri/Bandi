// DEC-12: the onboarding wizard's honest completion screen. Replaces the old
// "Completa e vai a Esplora bandi" CTA (which implied the profile was done
// after 3 of 8 sections) with the real completion percent, a named list of
// what's still missing, and a double CTA ("Completa ora" / "Lo faccio dopo").
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingComplete } from "../onboarding-complete";

describe("OnboardingComplete", () => {
  it("shows the actual completion percent, not a false 100%", () => {
    const html = renderToStaticMarkup(<OnboardingComplete percent={68} />);
    expect(html).toContain("68%");
    expect(html).not.toContain("100%");
  });

  it("names the sections still missing after onboarding", () => {
    const html = renderToStaticMarkup(<OnboardingComplete percent={68} />);
    expect(html).toContain("Capacità gestionale");
    expect(html).toContain("Documenti e registri");
    expect(html).toContain("Partnership");
    expect(html).toContain("Storico e finanze");
    // Sections already collected in the wizard are not re-listed as missing.
    expect(html).not.toContain("Identità</");
  });

  it("offers both CTAs: complete now (/profilo) and later (/)", () => {
    const html = renderToStaticMarkup(<OnboardingComplete percent={68} />);
    expect(html).toContain('href="/profilo"');
    expect(html).toContain("Completa ora");
    expect(html).toContain('href="/"');
    expect(html).toContain("Lo faccio dopo");
  });
});
