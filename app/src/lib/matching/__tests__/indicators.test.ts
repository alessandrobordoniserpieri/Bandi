import { describe, it, expect } from "vitest";
import { buildIndicators } from "../indicators";
import { isClosedGrant, deadlineDays } from "../helpers";
import type { EntityProfile, Grant } from "../types";

function grantInDays(days: number, o: Partial<Grant> = {}): Grant {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { status: "aperto", deadline: d.toISOString().split("T")[0], cofundingRequired: null, ...o } as Grant;
}
const p = (o: Partial<EntityProfile> = {}) => ({ cofundingCapacity: null, ...o } as EntityProfile);

describe("helpers", () => {
  it("isClosedGrant: chiuso status", () => {
    expect(isClosedGrant({ status: "chiuso", deadline: null } as Grant)).toBe(true);
  });
  it("isClosedGrant: past deadline", () => {
    expect(isClosedGrant(grantInDays(-3))).toBe(true);
  });
  it("deadlineDays: null when no deadline", () => {
    expect(deadlineDays(null)).toBeNull();
  });
});

describe("deadline indicator", () => {
  it("closed → nero", () => { expect(buildIndicators(p(), grantInDays(-1)).deadline.color).toBe("nero"); });
  it("< 7 days → rosso", () => { expect(buildIndicators(p(), grantInDays(3)).deadline.color).toBe("rosso"); });
  it("7..14 → giallo", () => { expect(buildIndicators(p(), grantInDays(10)).deadline.color).toBe("giallo"); });
  it(">= 15 → verde", () => { expect(buildIndicators(p(), grantInDays(40)).deadline.color).toBe("verde"); });
});

describe("cofunding indicator", () => {
  it("no requirement → grigio", () => {
    expect(buildIndicators(p(), grantInDays(40)).cofunding.color).toBe("grigio");
  });
  it("capacity covers requirement → verde", () => {
    expect(buildIndicators(p({ cofundingCapacity: 30 }), grantInDays(40, { cofundingRequired: 20 })).cofunding.color).toBe("verde");
  });
  it("requirement above capacity and > 20 → rosso", () => {
    expect(buildIndicators(p({ cofundingCapacity: 5 }), grantInDays(40, { cofundingRequired: 30 })).cofunding.color).toBe("rosso");
  });
});
