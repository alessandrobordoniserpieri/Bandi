import { describe, it, expect } from "vitest";
import { economicCoherence } from "../economic-coherence";
import type { EconomicLevel } from "../types";

// Midpoints: <20k=10k, 20-100k=60k, 100-500k=300k, >500k=750k.
// ratio = amount / midpoint. Using the 100-500k band (mid 300k) for clean boundary amounts.
const at = (ratio: number) => Math.round(ratio * 300_000);

describe("economicCoherence — §2.7A table with exact borders", () => {
  const level = (amount: number | null, band: Parameters<typeof economicCoherence>[1] = "100-500k"): EconomicLevel =>
    economicCoherence(amount, band).level;

  it("< 0.05 → da verificare (too small)", () => {
    expect(level(at(0.04))).toBe("da_verificare");
  });

  it("exactly 0.05 → alla tua portata (lower bound inclusive)", () => {
    expect(level(at(0.05))).toBe("alla_tua_portata");
  });

  it("0.3 border stays alla tua portata on both sides", () => {
    expect(level(at(0.29))).toBe("alla_tua_portata"); // fascia bassa
    expect(level(at(0.3))).toBe("alla_tua_portata");  // fascia alta
    expect(level(at(0.99))).toBe("alla_tua_portata");
  });

  it("exactly 1.0 → ambizioso", () => {
    expect(level(at(1.0))).toBe("ambizioso");
    expect(level(at(1.99))).toBe("ambizioso");
  });

  it("exactly 2.0 → still ambizioso; > 2.0 → fuori scala", () => {
    expect(level(at(2.0))).toBe("ambizioso");
    expect(level(at(2.01))).toBe("fuori_scala");
  });

  it("missing amount or budget → da verificare with null ratio", () => {
    expect(economicCoherence(null, "100-500k")).toEqual({ ratio: null, level: "da_verificare", label: "da verificare" });
    expect(economicCoherence(50_000, null)).toMatchObject({ ratio: null, level: "da_verificare" });
    expect(economicCoherence(0, "100-500k").level).toBe("da_verificare");
  });

  it("uses the documented band midpoints", () => {
    expect(economicCoherence(10_000, "<20k").ratio).toBe(1); // 10k / 10k
    expect(economicCoherence(60_000, "20-100k").ratio).toBe(1); // 60k / 60k
    expect(economicCoherence(750_000, ">500k").ratio).toBe(1); // 750k / 750k
  });

  it("carries the Italian label", () => {
    expect(economicCoherence(at(0.5), "100-500k").label).toBe("alla tua portata");
    expect(economicCoherence(at(1.5), "100-500k").label).toBe("ambizioso");
    expect(economicCoherence(at(3), "100-500k").label).toBe("fuori scala");
  });
});

describe("it-IT amount formatting", () => {
  it("groups thousands with dots", () => {
    expect((1_500_000).toLocaleString("it-IT")).toBe("1.500.000");
    expect((50_000).toLocaleString("it-IT")).toBe("50.000");
  });
});
