import { describe, it, expect } from "vitest";
import {
  LEGAL_TYPES, TAGS, PROVINCES, PROVINCE_TO_REGION,
  LEGAL_TYPE_GROUPS, WEIGHTS, CAPACITY_MATRIX,
  regionForProvince, groupForLegalType,
} from "../constants";

describe("constants invariants", () => {
  it("has 62 legal types and 47 tags", () => {
    expect(LEGAL_TYPES).toHaveLength(62);
    expect(TAGS).toHaveLength(47);
  });

  it("has 107 provinces, each mapped to a region", () => {
    expect(PROVINCES).toHaveLength(107);
    for (const code of PROVINCES) {
      expect(PROVINCE_TO_REGION[code], `province ${code}`).toBeTruthy();
    }
  });

  it("maps to exactly 20 regions", () => {
    const regions = new Set(Object.values(PROVINCE_TO_REGION));
    expect(regions.size).toBe(20);
  });

  it("weights sum to exactly 100", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("assigns every legal type to a group or null without throwing", () => {
    for (const t of LEGAL_TYPES) {
      expect(() => groupForLegalType(t)).not.toThrow();
    }
    // representative assignments
    expect(groupForLegalType("ASD - Associazione Sportiva Dilettantistica")).toBe("SPORTIVI");
    expect(groupForLegalType("APS - Associazione di Promozione Sociale")).toBe("TERZO_SETT");
    expect(groupForLegalType("Cooperativa sociale tipo A")).toBe("COOPERATIVE");
    expect(groupForLegalType("Comune")).toBe("ENTI_PUBBL");
  });

  it("derives region from province code", () => {
    expect(regionForProvince("RN")).toBe("Emilia-Romagna");
    expect(regionForProvince("RM")).toBe("Lazio");
    expect(regionForProvince("ZZ")).toBeNull();
  });

  it("capacity matrix is 3x3 with the design-doc values", () => {
    expect(CAPACITY_MATRIX.Bassa.alta).toBe(2);
    expect(CAPACITY_MATRIX.Media.media).toBe(14);
    expect(CAPACITY_MATRIX.Alta.alta).toBe(14);
    expect(LEGAL_TYPE_GROUPS.SPORTIVI).toContain("ASD");
  });
});
