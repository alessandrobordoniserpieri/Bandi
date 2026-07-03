import { describe, it, expect } from "vitest";
import { calculateCapacity, scoreCapacity } from "../dimensions/capacity";
import type { CapacityAnswers, EntityProfile, Grant } from "../types";

const answers = (o: Partial<CapacityAnswers> = {}): CapacityAnswers => ({
  stableStaff: "0-2", dedicatedAdmin: false, fundedProjects3y: "0",
  reportingExperience: "mai", annualBudget: "<20k", euProject: false, ...o,
});

describe("calculateCapacity", () => {
  it("all-minimum answers → Bassa (0 pts)", () => {
    expect(calculateCapacity(answers())).toBe("Bassa");
  });
  it("all-maximum answers → Alta (15 pts)", () => {
    expect(calculateCapacity(answers({
      stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+",
      reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true,
    }))).toBe("Alta");
  });
  it("mid answers → Media", () => {
    expect(calculateCapacity(answers({
      stableStaff: "3-10", dedicatedAdmin: true, fundedProjects3y: "1-2",
      reportingExperience: "qualche_volta", annualBudget: "20-100k", euProject: false,
    }))).toBe("Media"); // 1+2+1+1+1+0 = 6
  });
  it("null answers → null", () => {
    expect(calculateCapacity(null)).toBeNull();
  });
});

describe("scoreCapacity", () => {
  const p = (a: CapacityAnswers | null) => ({ capacity: a } as EntityProfile);
  const g = (complexity: Grant["complexity"]) => ({ complexity } as Grant);
  it("Bassa capacity × alta complexity → 2", () => {
    expect(scoreCapacity(p(answers()), g("alta")).value).toBe(2);
  });
  it("Alta capacity × alta complexity → 14", () => {
    const high = answers({ stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+", reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true });
    expect(scoreCapacity(p(high), g("alta")).value).toBe(14);
  });
  it("capacity null → neutral 9", () => {
    expect(scoreCapacity(p(null), g("alta")).value).toBe(9);
  });
  it("complexity null → neutral 9", () => {
    expect(scoreCapacity(p(answers()), g(null)).value).toBe(9);
  });
});
