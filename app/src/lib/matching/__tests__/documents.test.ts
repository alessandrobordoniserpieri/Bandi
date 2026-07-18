import { describe, it, expect } from "vitest";
import { scoreDocuments } from "../dimensions/documents";
import type { EntityDocuments, EntityProfile, Grant } from "../types";

const none: EntityDocuments = { statuto: false, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false };
const p = (docs: Partial<EntityDocuments>) => ({ documents: { ...none, ...docs } } as EntityProfile);
const g = (requiredDocuments: string[]) => ({ requiredDocuments } as Grant);

describe("scoreDocuments", () => {
  it("4/4 possessed → 12", () => {
    const r = scoreDocuments(p({ statuto: true, bilancio: true, runts: true, durc: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(12);
    expect(r.missing).toEqual([]);
  });
  it("3/4 possessed → 9 and lists the missing one", () => {
    const r = scoreDocuments(p({ statuto: true, bilancio: true, runts: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(9);
    expect(r.missing).toEqual(["durc"]);
  });
  it("1/4 possessed → 3", () => {
    const r = scoreDocuments(p({ statuto: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(3);
  });
  it("grant lists no documents → neutral 8, and known=false (unknown, not 'all clear')", () => {
    const r = scoreDocuments(p({}), g([]));
    expect(r.value).toBe(8);
    expect(r.known).toBe(false);
    expect(r.missing).toEqual([]);
  });

  it("grant lists documents → known=true", () => {
    expect(scoreDocuments(p({ statuto: true }), g(["statuto"])).known).toBe(true);
  });
});
