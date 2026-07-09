import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { FilterBar } = await import("../filter-bar");

describe("FilterBar", () => {
  it("keeps sort, solo-candidabili and the density toggle always visible", () => {
    const html = renderToStaticMarkup(<FilterBar filters={{}} sort="score" density="card" />);
    expect(html).toContain("Ordina per");
    expect(html).toContain("Solo candidabili");
    expect(html).toContain("Vista a card");
    expect(html).toContain("Vista compatta");
  });

  it("wraps verdetto, ambito and importo behind an 'Altri filtri' disclosure", () => {
    const html = renderToStaticMarkup(<FilterBar filters={{}} sort="score" density="card" />);
    expect(html).toContain("Altri filtri");
    const detailsStart = html.indexOf("filter-bar-more");
    expect(detailsStart).toBeGreaterThan(-1);
    const afterDetails = html.slice(detailsStart);
    expect(afterDetails).toContain("Verdetto");
    expect(afterDetails).toContain("Ambito");
    expect(afterDetails).toContain("Importo min");
    // the always-visible controls must come BEFORE the disclosure, not inside it
    const beforeDetails = html.slice(0, detailsStart);
    expect(beforeDetails).toContain("Ordina per");
    expect(beforeDetails).toContain("Solo candidabili");
  });
});
