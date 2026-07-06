import { describe, it, expect } from "vitest";
import { canTransition, nextStatuses, SAVED_STATUSES, STATUS_META, TRANSITIONS } from "../status";

describe("saved-grant state machine", () => {
  it("allows the forward pipeline", () => {
    expect(canTransition("salvato", "in_preparazione")).toBe(true);
    expect(canTransition("in_preparazione", "candidato")).toBe(true);
    expect(canTransition("candidato", "finanziato")).toBe(true);
    expect(canTransition("candidato", "non_ammesso")).toBe(true);
  });

  it("allows walking a step back", () => {
    expect(canTransition("in_preparazione", "salvato")).toBe(true);
    expect(canTransition("candidato", "in_preparazione")).toBe(true);
    expect(canTransition("finanziato", "candidato")).toBe(true);
    expect(canTransition("non_ammesso", "candidato")).toBe(true);
  });

  it("rejects skips and illegal jumps", () => {
    expect(canTransition("salvato", "candidato")).toBe(false);
    expect(canTransition("salvato", "finanziato")).toBe(false);
    expect(canTransition("finanziato", "non_ammesso")).toBe(false);
    expect(canTransition("candidato", "salvato")).toBe(false);
    expect(canTransition("salvato", "salvato")).toBe(false); // not a transition
  });

  it("nextStatuses mirrors TRANSITIONS", () => {
    for (const s of SAVED_STATUSES) expect(nextStatuses(s)).toEqual(TRANSITIONS[s]);
  });

  it("has a label and hex color for every status", () => {
    for (const s of SAVED_STATUSES) {
      expect(STATUS_META[s].label).toBeTruthy();
      expect(STATUS_META[s].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
