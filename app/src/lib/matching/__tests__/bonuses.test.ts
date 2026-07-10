import { describe, it, expect } from "vitest";
import { computeBonuses } from "../bonuses";
import type { EntityProfile, Grant } from "../types";

const p = (o: Partial<EntityProfile> = {}) =>
  ({ publicPartners: false, privatePartners: false, cofundingCapacity: null, ...o } as EntityProfile);
const g = (o: Partial<Grant> = {}) =>
  ({ complexity: "media", cofundingPercentage: null, ...o } as Grant);

describe("computeBonuses", () => {
  it("partner +5 when entity has partners and grant complexity is alta", () => {
    const b = computeBonuses(p({ publicPartners: true }), g({ complexity: "alta" }));
    expect(b.find((x) => x.key === "partner")?.value).toBe(5);
  });
  it("no partner bonus when complexity is not alta", () => {
    const b = computeBonuses(p({ publicPartners: true }), g({ complexity: "media" }));
    expect(b.find((x) => x.key === "partner")).toBeUndefined();
  });
  it("cofunding manageable +3", () => {
    const b = computeBonuses(p({ cofundingCapacity: 30 }), g({ cofundingPercentage: 20 }));
    expect(b.find((x) => x.key === "cofunding")?.value).toBe(3);
  });
  it("cofunding unsustainable -5 when required > 20 and above capacity", () => {
    const b = computeBonuses(p({ cofundingCapacity: 10 }), g({ cofundingPercentage: 30 }));
    expect(b.find((x) => x.key === "cofunding")?.value).toBe(-5);
  });
  it("no cofunding item when grant has no cofunding requirement", () => {
    expect(computeBonuses(p(), g({ cofundingPercentage: null })).find((x) => x.key === "cofunding")).toBeUndefined();
  });
});
