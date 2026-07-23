import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "../error-state";

describe("ErrorState", () => {
  it("is announced to assistive technology as an alert", () => {
    const html = renderToStaticMarkup(<ErrorState onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
  });

  it("offers a keyboard-operable recovery control", () => {
    const html = renderToStaticMarkup(<ErrorState onRetry={() => {}} />);
    expect(html).toMatch(/<button[^>]*>[^<]*Riprova/);
  });

  it("names the problem with a custom title and description", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="Impossibile caricare i bandi"
        description="Si è verificato un problema temporaneo."
        onRetry={() => {}}
      />,
    );
    expect(html).toContain("Impossibile caricare i bandi");
    expect(html).toContain("Si è verificato un problema temporaneo.");
  });

  it("falls back to a branded default title when none is given", () => {
    const html = renderToStaticMarkup(<ErrorState onRetry={() => {}} />);
    expect(html).toContain("Qualcosa è andato storto");
  });
});
