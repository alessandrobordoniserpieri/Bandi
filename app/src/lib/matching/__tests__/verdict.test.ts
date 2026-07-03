import { describe, it, expect } from "vitest";
import { deriveVerdict } from "../verdict";

describe("deriveVerdict", () => {
  it("closed grant → Storico even at score 100", () => {
    expect(deriveVerdict(100, true, true)).toBe("Storico");
  });
  it(">=75 with all docs → Candidabile", () => { expect(deriveVerdict(80, true, false)).toBe("Candidabile"); });
  it(">=75 missing docs → Da preparare", () => { expect(deriveVerdict(80, false, false)).toBe("Da preparare"); });
  it(">=50 → Da valutare", () => { expect(deriveVerdict(60, true, false)).toBe("Da valutare"); });
  it(">=30 → Bassa priorità", () => { expect(deriveVerdict(40, true, false)).toBe("Bassa priorità"); });
  it("<30 → Non compatibile", () => { expect(deriveVerdict(10, true, false)).toBe("Non compatibile"); });
});
