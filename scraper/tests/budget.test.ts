import { describe, it, expect } from "vitest";
import { createBudget, UNLIMITED_BUDGET } from "../src/pipeline/budget";

describe("createBudget", () => {
  it("has time for work that fits before the deadline", () => {
    let t = 1000;
    const budget = createBudget(10_000, () => t);
    expect(budget.hasTimeFor(5_000)).toBe(true);
    expect(budget.remainingMs()).toBe(10_000);
    t = 6000; // 5s elapsed
    expect(budget.remainingMs()).toBe(5_000);
    expect(budget.hasTimeFor(5_000)).toBe(true);   // exactly fits
    expect(budget.hasTimeFor(5_001)).toBe(false);  // one ms too much
  });

  it("refuses work once the deadline is passed", () => {
    let t = 0;
    const budget = createBudget(1_000, () => t);
    t = 2000;
    expect(budget.remainingMs()).toBe(-1000);
    expect(budget.hasTimeFor(1)).toBe(false);
  });
});

describe("UNLIMITED_BUDGET", () => {
  it("always has time", () => {
    expect(UNLIMITED_BUDGET.hasTimeFor(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(UNLIMITED_BUDGET.remainingMs()).toBe(Number.POSITIVE_INFINITY);
  });
});
