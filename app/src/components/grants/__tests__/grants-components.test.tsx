import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeadlineBadge } from "../deadline-badge";
import { VerdictBadge } from "../verdict-badge";
import { ScoreBreakdown } from "../score-breakdown";
import { DocumentChecklist } from "../document-checklist";
import type { BreakdownItem } from "@/lib/matching";

describe("DeadlineBadge", () => {
  it("renders each of the 4 colors from the indicator", () => {
    for (const color of ["verde", "giallo", "rosso", "nero"] as const) {
      const html = renderToStaticMarkup(
        <DeadlineBadge indicator={{ days: 5, color, label: `label-${color}` }} />,
      );
      expect(html).toContain(`data-color="${color}"`);
      expect(html).toContain(`label-${color}`);
    }
  });
});

describe("VerdictBadge", () => {
  it("renders the verdict text and data attribute", () => {
    const html = renderToStaticMarkup(<VerdictBadge verdict="Candidabile" />);
    expect(html).toContain("Candidabile");
    expect(html).toContain('data-verdict="Candidabile"');
  });
});

describe("ScoreBreakdown", () => {
  it("renders exactly 6 progress bars with value/max and notes", () => {
    const items: BreakdownItem[] = [
      { key: "themes", label: "Temi", value: 20, max: 28, note: "n1" },
      { key: "legalForm", label: "Forma", value: 22, max: 22, note: "n2" },
      { key: "territory", label: "Territorio", value: 10, max: 18, note: "n3" },
      { key: "capacity", label: "Capacità", value: 9, max: 14, note: "n4" },
      { key: "documents", label: "Documenti", value: 8, max: 12, note: "n5" },
      { key: "trackRecord", label: "Storico", value: 3, max: 6, note: "n6" },
    ];
    const html = renderToStaticMarkup(<ScoreBreakdown breakdown={items} />);
    expect((html.match(/<progress/g) ?? []).length).toBe(6);
    expect(html).toContain("Temi");
    expect(html).toContain("value=\"20\"");
    expect(html).toContain("max=\"28\"");
    expect(html).toContain("n6");
  });
});

describe("DocumentChecklist", () => {
  it("lists missing documents under the italian heading", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={["statuto", "durc"]} />);
    expect(html).toContain("Per candidarti ti manca");
    expect(html).toContain("statuto");
    expect(html).toContain("durc");
  });
  it("shows the all-clear message when nothing is missing", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={[]} />);
    expect(html).toContain("Hai tutti i documenti richiesti");
  });
});
