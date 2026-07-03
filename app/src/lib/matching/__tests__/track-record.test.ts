import { describe, it, expect } from "vitest";
import { scoreTrackRecord } from "../dimensions/track-record";
import type { EntityProfile, Grant, ProjectHistoryRow, ProviderKind } from "../types";

const funded = (n: number, kind: ProviderKind = "pubblico"): ProjectHistoryRow[] =>
  Array.from({ length: n }, (_, i) => ({
    grantName: `g${i}`, providerId: null, year: 2022, outcome: "finanziato", amount: null, kind,
  }));
const p = (rows: ProjectHistoryRow[], received: ProviderKind[] = []) =>
  ({ projectHistory: rows, fundingTypesReceived: received } as EntityProfile);
const g = (providerKind: ProviderKind | null) => ({ providerKind } as Grant);

describe("scoreTrackRecord", () => {
  it("0 funded → 0", () => { expect(scoreTrackRecord(p([]), g(null)).value).toBe(0); });
  it("2 funded → 2", () => { expect(scoreTrackRecord(p(funded(2)), g(null)).value).toBe(2); });
  it("4 funded → 4", () => { expect(scoreTrackRecord(p(funded(4)), g(null)).value).toBe(4); });
  it("6 funded → 5", () => { expect(scoreTrackRecord(p(funded(6)), g(null)).value).toBe(5); });
  it("+1 bonus for same funding kind, capped at 6", () => {
    expect(scoreTrackRecord(p(funded(6, "eu"), ["eu"]), g("eu")).value).toBe(6);
  });
  it("only 'finanziato' rows count", () => {
    const mixed: ProjectHistoryRow[] = [
      { grantName: "a", providerId: null, year: 2022, outcome: "non_ammesso", amount: null, kind: "pubblico" },
      ...funded(1),
    ];
    expect(scoreTrackRecord(p(mixed), g(null)).value).toBe(2);
  });
});
