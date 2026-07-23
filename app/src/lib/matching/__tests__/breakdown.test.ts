import { describe, it, expect } from "vitest";
import { buildBreakdown } from "../breakdown";
import type { DimensionScore, DimensionKey } from "../types";

function score(value: number, max: number): DimensionScore {
  return { value, max, note: "" };
}

describe("buildBreakdown", () => {
  it("labels the trackRecord dimension 'Storico attività', not the English 'Track record'", () => {
    const dims: Record<DimensionKey, DimensionScore> = {
      themes: score(20, 28), legalForm: score(22, 22), territory: score(10, 18),
      capacity: score(9, 14), documents: score(8, 12), trackRecord: score(3, 6),
    };
    const items = buildBreakdown(dims);
    const trackRecordItem = items.find((i) => i.key === "trackRecord");
    // Disambiguates from the "Storico" verdict and the profile's "Storico e finanze" section
    // (concept §6.3 — 3 things sharing the name "Storico").
    expect(trackRecordItem?.label).toBe("Storico attività");
    expect(trackRecordItem?.label).not.toBe("Track record");
  });
});
