import { describe, it, expect } from "vitest";
import { scoreThemes } from "../dimensions/themes";
import type { EntityProfile, Grant } from "../types";

const p = (themes: string[]) => ({ themes } as EntityProfile);
const g = (tags: string[]) => ({ tags } as Grant);

describe("scoreThemes", () => {
  it("full coverage of grant themes → 28", () => {
    expect(scoreThemes(p(["sport", "giovani"]), g(["sport", "giovani"])).value).toBe(28);
  });
  it("half coverage → 14", () => {
    expect(scoreThemes(p(["sport"]), g(["sport", "giovani"])).value).toBe(14);
  });
  it("no shared tags → 0", () => {
    expect(scoreThemes(p(["cultura"]), g(["sport", "giovani"])).value).toBe(0);
  });
  it("grant with no tags → neutral 19", () => {
    expect(scoreThemes(p(["sport"]), g([])).value).toBe(19);
  });
  it("never exceeds 28 when entity has extra themes", () => {
    const r = scoreThemes(p(["sport", "giovani", "cultura"]), g(["sport"]));
    expect(r.value).toBe(28);
    expect(r.max).toBe(28);
  });
  it("de-duplicates repeated themes (no ratio inflation)", () => {
    // profile ["sport","sport"] vs grant ["sport","giovani"] → 1 distinct shared / 2 → 14, not 28
    expect(scoreThemes(p(["sport", "sport"]), g(["sport", "giovani"])).value).toBe(14);
  });
});
