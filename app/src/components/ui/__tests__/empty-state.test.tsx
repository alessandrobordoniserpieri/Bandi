import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders its title and description", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Nessun bando salvato" description="Salva un bando per iniziare." />,
    );
    expect(html).toContain("Nessun bando salvato");
    expect(html).toContain("Salva un bando per iniziare.");
  });

  it("renders an actionable CTA link when an action is provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="x" action={{ label: "Esplora bandi", href: "/" }} />,
    );
    expect(html).toContain("Esplora bandi");
    expect(html).toContain('href="/"');
    expect(html).toContain("empty-state-actions");
  });

  it("omits the actions block when no action is given (a pure no-results state)", () => {
    const html = renderToStaticMarkup(<EmptyState title="x" />);
    expect(html).not.toContain("empty-state-actions");
  });

  it("gives the title a real heading so it joins the document outline", () => {
    const html = renderToStaticMarkup(<EmptyState title="Titolo vuoto" />);
    expect(html).toMatch(/<h2[^>]*>[^<]*Titolo vuoto/);
  });
});
