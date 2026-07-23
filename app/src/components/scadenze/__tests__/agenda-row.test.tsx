import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgendaRow } from "../agenda-row";
import type { SavedGrantView } from "@/lib/saved-grants/queries";

function view(overrides: Partial<SavedGrantView> = {}): SavedGrantView {
  return {
    savedGrantId: "sg1",
    status: "in_preparazione",
    notes: null,
    providerName: "Fondazione Test",
    verdict: "Da preparare",
    deadline: { days: 5, color: "giallo", label: "scade tra 5 giorni" },
    grant: { id: "g1", title: "Bando Sport 2026" } as SavedGrantView["grant"],
    ...overrides,
  };
}

describe("AgendaRow", () => {
  it("renders the title as a link to the grant detail", () => {
    const html = renderToStaticMarkup(<AgendaRow item={view()} />);
    expect(html).toContain("Bando Sport 2026");
    expect(html).toContain('href="/bandi/g1"');
  });

  it("shows the provider name", () => {
    const html = renderToStaticMarkup(<AgendaRow item={view()} />);
    expect(html).toContain("Fondazione Test");
  });

  it("shows verdict, pipeline status, and deadline badges (DEC-13: verdetto + stato pipeline)", () => {
    const html = renderToStaticMarkup(<AgendaRow item={view()} />);
    expect(html).toContain('data-verdict="Da preparare"');
    expect(html).toContain('data-status="in_preparazione"');
    expect(html).toContain('data-color="giallo"');
    expect(html).toContain("scade tra 5 giorni");
  });

  it("omits the verdict badge when no profile-based verdict is available", () => {
    const html = renderToStaticMarkup(<AgendaRow item={view({ verdict: null })} />);
    expect(html).not.toContain("data-verdict");
    expect(html).toContain("scade tra 5 giorni");
  });
});
