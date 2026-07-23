import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedGrantCard } from "../saved-grant-card";
import { SlotCounter } from "../slot-counter";
import type { SavedGrantView } from "@/lib/saved-grants/queries";

// A minimal saved-grant view; the card only reads title/id/provider/status/verdict/deadline.
function view(overrides: Partial<SavedGrantView> = {}): SavedGrantView {
  return {
    savedGrantId: "sg1",
    status: "salvato",
    notes: null,
    providerName: "Fondazione Test",
    verdict: "Candidabile",
    deadline: { days: 5, color: "giallo", label: "scade tra 5 giorni" },
    grant: { id: "g1", title: "Bando Sport 2026" } as SavedGrantView["grant"],
    ...overrides,
  };
}

describe("SavedGrantCard", () => {
  it("renders the title as a link to the grant detail, at readable hierarchy", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view()} />);
    expect(html).toContain("Bando Sport 2026");
    expect(html).toContain('href="/bandi/g1"');
  });

  it("shows the provider name", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view()} />);
    expect(html).toContain("Fondazione Test");
  });

  it("shows the verdict badge (matching info no longer hidden) — DEC-2", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view()} />);
    expect(html).toContain('data-verdict="Candidabile"');
    expect(html).toContain("Candidabile");
  });

  it("shows the deadline badge with color + label (color is never the only cue) — DEC-2", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view()} />);
    expect(html).toContain('data-color="giallo"');
    expect(html).toContain("scade tra 5 giorni");
  });

  it("does NOT render the 6-dimension breakdown (stays in the detail) — DEC-2", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view()} />);
    expect(html).not.toContain("<progress");
  });

  it("omits the verdict badge when no profile-based verdict is available", () => {
    const html = renderToStaticMarkup(<SavedGrantCard item={view({ verdict: null })} />);
    expect(html).not.toContain("data-verdict");
    // deadline + title still present — deadline needs no profile
    expect(html).toContain("scade tra 5 giorni");
    expect(html).toContain("Bando Sport 2026");
  });
});

describe("SlotCounter", () => {
  it('renders "N / M bandi salvati" with the working-set usage — DEC-2/DEC-6', () => {
    const html = renderToStaticMarkup(<SlotCounter count={7} limit={10} />);
    expect(html).toContain("7");
    expect(html).toContain("10");
    expect(html).toContain("bandi salvati");
  });
});
