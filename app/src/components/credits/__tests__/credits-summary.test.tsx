import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditsSummary } from "../credits-summary";

describe("CreditsSummary", () => {
  it("shows the free, paid and total balance as readable numbers", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 82, paid: 5, total: 87 }} />,
    );
    expect(html).toContain("82");
    expect(html).toContain("5");
    expect(html).toContain("87");
  });

  it("never leaks raw snake_case tokens onto the screen (§6.3)", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 82, paid: 5, total: 87 }} />,
    );
    expect(html).not.toMatch(/free_balance|paid_balance/);
  });

  it("explains that chat consumes credits", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 100, paid: 0, total: 100 }} />,
    );
    expect(html).toMatch(/chat/i);
    expect(html).toMatch(/credit/i);
  });

  it("explains that quick analysis and document prep are a daily rate limit, not credits", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 100, paid: 0, total: 100 }} />,
    );
    expect(html).toMatch(/analisi rapida/i);
    expect(html).toMatch(/preparazione.*document/i);
    expect(html).toMatch(/giornalier/i);
  });

  it("clarifies that saving a grant is not the same as preparing its documents", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 100, paid: 0, total: 100 }} />,
    );
    expect(html).toMatch(/salvare.*non/i);
  });

  it("uses a real heading for the explanation section (a11y)", () => {
    const html = renderToStaticMarkup(
      <CreditsSummary balance={{ free: 100, paid: 0, total: 100 }} />,
    );
    expect(html).toMatch(/<h2[^>]*>/);
  });
});
