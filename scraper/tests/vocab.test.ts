import { describe, it, expect } from "vitest";
import { TAGS, LEGAL_TYPES, DOCUMENT_KEYS } from "../src/pipeline/vocab";

describe("vocab", () => {
  it("has 47 tags, all lowercase (except known acronyms) and unique", () => {
    expect(TAGS.length).toBe(47);
    expect(new Set(TAGS).size).toBe(47);
    // "NEET" is a real acronym present verbatim in app/src/lib/matching/constants.ts
    // (also used as-is in TAG_MACRO_AREAS there); the app's own constants.test.ts
    // does not assert an all-lowercase invariant either, so it is an intentional
    // exception here rather than a mis-copy.
    const acronymExceptions = new Set(["NEET"]);
    for (const t of TAGS) {
      if (!acronymExceptions.has(t)) expect(t).toBe(t.toLowerCase());
    }
  });
  it("has 62 legal types, unique", () => {
    expect(LEGAL_TYPES.length).toBe(62);
    expect(new Set(LEGAL_TYPES).size).toBe(62);
  });
  it("has the 6 document keys", () => {
    expect(DOCUMENT_KEYS).toEqual(["statuto", "bilancio", "runts", "rasd", "durc", "certificazioni"]);
  });
});
