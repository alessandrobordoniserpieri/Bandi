import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UrgencyGroupSection } from "../urgency-group-section";
import type { UrgencyGroup } from "@/lib/scadenze/group";
import type { SavedGrantView } from "@/lib/saved-grants/queries";

function item(id: string, title: string): SavedGrantView {
  return {
    savedGrantId: id,
    status: "salvato",
    notes: null,
    providerName: null,
    verdict: null,
    deadline: { days: 3, color: "rosso", label: "scade tra 3 giorni" },
    grant: { id, title } as SavedGrantView["grant"],
  };
}

describe("UrgencyGroupSection", () => {
  it("renders the group label as a heading, with the item count", () => {
    const group: UrgencyGroup = {
      bucket: "questa-settimana",
      label: "Questa settimana",
      items: [item("g1", "Bando A"), item("g2", "Bando B")],
    };
    const html = renderToStaticMarkup(<UrgencyGroupSection group={group} />);
    expect(html).toContain("<h2");
    expect(html).toContain("Questa settimana");
    expect(html).toContain("(2)");
  });

  it("renders one row per item", () => {
    const group: UrgencyGroup = {
      bucket: "oltre",
      label: "Oltre",
      items: [item("g1", "Bando A"), item("g2", "Bando B")],
    };
    const html = renderToStaticMarkup(<UrgencyGroupSection group={group} />);
    expect(html).toContain("Bando A");
    expect(html).toContain("Bando B");
  });
});
