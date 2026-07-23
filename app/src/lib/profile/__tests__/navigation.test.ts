import { describe, it, expect } from "vitest";
import {
  PROFILE_SUBNAV_KEYS,
  isSubNavKey,
  subNavLabel,
  priorityLabel,
  firstIncompleteSection,
  resolveActiveSection,
} from "../navigation";
import { SECTION_KEYS } from "../constants";
import type { CompletionSuggestion } from "../completion";

function suggestion(section: CompletionSuggestion["section"]): CompletionSuggestion {
  return { section, points: 1, message: "x" };
}

describe("PROFILE_SUBNAV_KEYS", () => {
  it("is the 8 profile sections plus notifiche, in order", () => {
    expect(PROFILE_SUBNAV_KEYS).toEqual([...SECTION_KEYS, "notifiche"]);
  });
});

describe("isSubNavKey", () => {
  it("accepts real section keys and notifiche", () => {
    expect(isSubNavKey("identity")).toBe(true);
    expect(isSubNavKey("notifiche")).toBe(true);
  });

  it("rejects unknown or non-string values", () => {
    expect(isSubNavKey("nope")).toBe(false);
    expect(isSubNavKey(undefined)).toBe(false);
    expect(isSubNavKey(42)).toBe(false);
  });
});

describe("subNavLabel", () => {
  it("uses the section label for real sections", () => {
    expect(subNavLabel("identity")).toBe("Identità");
  });

  it("labels the notifiche entry", () => {
    expect(subNavLabel("notifiche")).toBe("Notifiche");
  });
});

describe("priorityLabel", () => {
  it("maps the 'dopo' token to a readable Italian label, never the raw token", () => {
    expect(priorityLabel("dopo")).toBe("Consigliata dopo l'avvio");
    expect(priorityLabel("dopo")).not.toBe("dopo");
  });

  it("maps the other priorities to readable labels", () => {
    expect(priorityLabel("obbligatoria")).toBe("Obbligatoria");
    expect(priorityLabel("suggerita")).toBe("Consigliata");
  });
});

describe("firstIncompleteSection", () => {
  it("returns null when there are no suggestions", () => {
    expect(firstIncompleteSection([])).toBeNull();
  });

  it("returns the first incomplete section in canonical order, not suggestion order", () => {
    // Suggestions come sorted by points desc; canonical order must still win.
    const suggestions = [suggestion("history"), suggestion("capacity"), suggestion("documents")];
    expect(firstIncompleteSection(suggestions)).toBe("capacity");
  });

  it("returns identity when everything weighted is incomplete", () => {
    const suggestions = SECTION_KEYS.map(suggestion);
    expect(firstIncompleteSection(suggestions)).toBe("identity");
  });
});

describe("resolveActiveSection", () => {
  it("returns the requested section when the param is a valid key", () => {
    expect(resolveActiveSection("themes", "capacity")).toBe("themes");
  });

  it("accepts the notifiche section from the param", () => {
    expect(resolveActiveSection("notifiche", null)).toBe("notifiche");
  });

  it("falls back to the first incomplete section for an unknown param", () => {
    expect(resolveActiveSection("bogus", "documents")).toBe("documents");
  });

  it("falls back to the first incomplete section when no param is given", () => {
    expect(resolveActiveSection(undefined, "capacity")).toBe("capacity");
  });

  it("defaults to identity when the profile is complete (no incomplete section)", () => {
    expect(resolveActiveSection(undefined, null)).toBe("identity");
  });

  it("uses the first value of a repeated query param", () => {
    expect(resolveActiveSection(["themes", "identity"], null)).toBe("themes");
  });
});
