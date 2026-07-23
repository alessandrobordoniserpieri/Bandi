import { describe, it, expect } from "vitest";
import { groupByUrgency } from "../group";
import type { SavedGrantView } from "@/lib/saved-grants/queries";

// A minimal saved-grant view; grouping only reads deadline.days + savedGrantId.
function view(days: number | null, overrides: Partial<SavedGrantView> = {}): SavedGrantView {
  return {
    savedGrantId: `sg-${days ?? "null"}-${Math.random()}`,
    status: "salvato",
    notes: null,
    providerName: null,
    verdict: null,
    deadline: { days, color: "verde", label: days == null ? "senza scadenza" : `scade tra ${days} giorni` },
    grant: { id: "g1", title: "Bando" } as SavedGrantView["grant"],
    ...overrides,
  };
}

describe("groupByUrgency", () => {
  it("puts a grant with 3 days left in 'Questa settimana'", () => {
    const groups = groupByUrgency([view(3)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("questa-settimana");
    expect(groups[0].label).toBe("Questa settimana");
  });

  it("puts a grant with 20 days left in 'Questo mese'", () => {
    const groups = groupByUrgency([view(20)]);
    expect(groups[0].bucket).toBe("questo-mese");
    expect(groups[0].label).toBe("Questo mese");
  });

  it("puts a grant with 45 days left in 'Oltre'", () => {
    const groups = groupByUrgency([view(45)]);
    expect(groups[0].bucket).toBe("oltre");
    expect(groups[0].label).toBe("Oltre");
  });

  it("puts a grant with no deadline in 'Oltre'", () => {
    const groups = groupByUrgency([view(null)]);
    expect(groups[0].bucket).toBe("oltre");
  });

  it("puts an already-passed deadline in 'Oltre'", () => {
    const groups = groupByUrgency([view(-2)]);
    expect(groups[0].bucket).toBe("oltre");
  });

  it("treats the week/month boundaries as half-open (7 -> month, 30 -> oltre)", () => {
    expect(groupByUrgency([view(7)])[0].bucket).toBe("questo-mese");
    expect(groupByUrgency([view(29)])[0].bucket).toBe("questo-mese");
    expect(groupByUrgency([view(30)])[0].bucket).toBe("oltre");
  });

  it("sorts items within a group ascending by deadline", () => {
    const groups = groupByUrgency([view(5), view(1), view(3)]);
    expect(groups[0].items.map((i) => i.deadline.days)).toEqual([1, 3, 5]);
  });

  it("orders groups questa-settimana, questo-mese, oltre and omits empty groups", () => {
    const groups = groupByUrgency([view(20), view(2)]);
    expect(groups.map((g) => g.bucket)).toEqual(["questa-settimana", "questo-mese"]);
  });

  it("returns an empty array for no saved grants", () => {
    expect(groupByUrgency([])).toEqual([]);
  });
});
