import { describe, it, expect } from "vitest";
import { scoreLegalForm } from "../dimensions/legal-form";
import type { EntityProfile, Grant } from "../types";

const ASD = "ASD - Associazione Sportiva Dilettantistica";
const SSD = "SSD - Società Sportiva Dilettantistica";
const APS = "APS - Associazione di Promozione Sociale";
const p = (legalType: string) => ({ legalType } as EntityProfile);
const g = (eligibleTypes: string[]) => ({ eligibleTypes } as Grant);

describe("scoreLegalForm", () => {
  it("exact type match → 22", () => {
    expect(scoreLegalForm(p(ASD), g([ASD, APS])).value).toBe(22);
  });
  it("grant open to all (empty eligible list) → 22", () => {
    expect(scoreLegalForm(p(ASD), g([])).value).toBe(22);
  });
  it("same group, different subtype → 11", () => {
    expect(scoreLegalForm(p(ASD), g([SSD])).value).toBe(11); // both SPORTIVI
  });
  it("different group → 0", () => {
    expect(scoreLegalForm(p("Comune"), g([ASD, SSD])).value).toBe(0);
  });
});
