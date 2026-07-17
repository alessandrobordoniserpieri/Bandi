import { describe, it, expect } from "vitest";
import { scoreLegalForm } from "../dimensions/legal-form";
import type { EntityProfile, Grant } from "../types";

const ASD = "ASD - Associazione Sportiva Dilettantistica";
const SSD = "SSD - Società Sportiva Dilettantistica";
const APS = "APS - Associazione di Promozione Sociale";
const ECCLESIA = "Ente ecclesiastico civilmente riconosciuto";
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

  // Ecclesiastical entities are group-less (see LEGAL_TYPE_TO_GROUP comment): exact match still
  // scores full, but there is NO half-point cross-affinity with lay third-sector entities.
  it("ecclesiastical entity exactly matches an ecclesiastical-only bando → 22", () => {
    expect(scoreLegalForm(p(ECCLESIA), g([ECCLESIA])).value).toBe(22);
  });
  it("a lay APS does NOT half-match a bando reserved to ecclesiastical entities → 0", () => {
    expect(scoreLegalForm(p(APS), g([ECCLESIA])).value).toBe(0);
  });
  it("an ecclesiastical entity does NOT half-match a third-sector-only bando → 0", () => {
    expect(scoreLegalForm(p(ECCLESIA), g([APS])).value).toBe(0);
  });
});
