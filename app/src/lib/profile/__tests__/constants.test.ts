import { describe, it, expect } from "vitest";
import {
  OUTCOME_OPTIONS, OUTCOME_LABELS,
  INCOME_SOURCE_OPTIONS, INCOME_SOURCE_LABELS,
  REPORTING_EXPERIENCE_OPTIONS, REPORTING_EXPERIENCE_LABELS,
} from "../constants";

// Concept §6.3: raw snake_case tokens must never reach the screen — every value
// persisted to the DB needs a readable Italian label.
describe("profile vocabulary — no raw snake_case token reaches the screen", () => {
  it("maps every OUTCOME_OPTIONS value to a readable label", () => {
    for (const value of OUTCOME_OPTIONS) {
      expect(OUTCOME_LABELS[value]).toBeTruthy();
      expect(OUTCOME_LABELS[value]).not.toContain("_");
    }
    expect(OUTCOME_LABELS.non_ammesso).toBe("Non ammesso");
    expect(OUTCOME_LABELS.in_valutazione).toBe("In valutazione");
  });

  it("maps every INCOME_SOURCE_OPTIONS value to a readable label", () => {
    for (const value of INCOME_SOURCE_OPTIONS) {
      expect(INCOME_SOURCE_LABELS[value]).toBeTruthy();
      expect(INCOME_SOURCE_LABELS[value]).not.toContain("_");
    }
    expect(INCOME_SOURCE_LABELS.quote_associative).toBe("Quote associative");
    expect(INCOME_SOURCE_LABELS.contributi_pubblici).toBe("Contributi pubblici");
    expect(INCOME_SOURCE_LABELS.attivita_commerciale).toBe("Attività commerciale");
  });

  it("maps every REPORTING_EXPERIENCE_OPTIONS value to a readable label", () => {
    for (const value of REPORTING_EXPERIENCE_OPTIONS) {
      expect(REPORTING_EXPERIENCE_LABELS[value]).toBeTruthy();
      expect(REPORTING_EXPERIENCE_LABELS[value]).not.toContain("_");
    }
    expect(REPORTING_EXPERIENCE_LABELS.qualche_volta).toBe("Qualche volta");
  });
});
