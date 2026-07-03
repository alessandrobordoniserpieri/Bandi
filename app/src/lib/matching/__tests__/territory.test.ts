import { describe, it, expect } from "vitest";
import { scoreTerritory } from "../dimensions/territory";
import type { EntityProfile, Grant, GeoScope } from "../types";

const base = { province: "RN", region: "Emilia-Romagna", operatingProvinces: [] as string[] };
const p = (o: Partial<EntityProfile> = {}) => ({ ...base, ...o } as EntityProfile);
const g = (geoScope: GeoScope | null, area: string | null = null) => ({ geoScope, area } as Grant);

describe("scoreTerritory", () => {
  it("nazionale → 18", () => { expect(scoreTerritory(p(), g("nazionale")).value).toBe(18); });
  it("europeo → 18", () => { expect(scoreTerritory(p(), g("europeo")).value).toBe(18); });
  it("regionale same region → 18", () => { expect(scoreTerritory(p(), g("regionale", "Emilia-Romagna")).value).toBe(18); });
  it("regionale different region → 0", () => { expect(scoreTerritory(p(), g("regionale", "Sicilia")).value).toBe(0); });
  it("provinciale same province → 18", () => { expect(scoreTerritory(p(), g("provinciale", "RN")).value).toBe(18); });
  it("provinciale via operatingProvinces → 18", () => {
    expect(scoreTerritory(p({ operatingProvinces: ["BO"] }), g("provinciale", "BO")).value).toBe(18);
  });
  it("provinciale different province → 0", () => { expect(scoreTerritory(p(), g("provinciale", "Palermo")).value).toBe(0); });
  it("no geoScope and no area → neutral 12", () => { expect(scoreTerritory(p(), g(null, null)).value).toBe(12); });
  it("area present but no geoScope → uncertainty 5", () => { expect(scoreTerritory(p(), g(null, "qualche testo")).value).toBe(5); });
});
