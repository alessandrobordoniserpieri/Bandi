import { describe, it, expect } from "vitest";
import {
  applyFilters, applySort, parseFilters, serializeFilters, countByVerdict,
  type Filters, type SortKey,
} from "../filters";
import type { MatchedGrant } from "../match-list";
import type { Verdict, GeoScope } from "@/lib/matching";

function mg(over: {
  id: string; score?: number; verdict?: Verdict; days?: number | null;
  amount?: number | null; geoScope?: GeoScope | null; tags?: string[];
}): MatchedGrant {
  return {
    grant: {
      id: over.id, title: over.id, providerId: null, providerKind: null,
      deadline: null, status: "aperto", amount: over.amount ?? null, cofundingRequired: null,
      eligibleTypes: [], tags: over.tags ?? [], area: null,
      geoScope: over.geoScope ?? null, complexity: null, requiredDocuments: [],
      summary: "", requirements: "", url: `https://x/${over.id}`, beneficiaries: "",
    },
    providerName: null,
    match: {
      score: over.score ?? 50, baseScore: over.score ?? 50, verdict: over.verdict ?? "Da valutare",
      breakdown: [], bonuses: [],
      indicators: {
        deadline: { days: over.days === undefined ? 10 : over.days, color: "verde", label: "" },
        cofunding: { required: null, color: "grigio", label: "" },
        economic: { ratio: null, level: "da_verificare", label: "da verificare", amount: null, budgetKnown: false },
      },
      missingDocuments: [], actions: [],
    },
  } as MatchedGrant;
}

describe("applyFilters", () => {
  const list = [
    mg({ id: "a", verdict: "Candidabile", days: 5, amount: 10000, geoScope: "regionale", tags: ["sport"] }),
    mg({ id: "b", verdict: "Da preparare", days: 40, amount: 100000, geoScope: "nazionale", tags: ["cultura"] }),
    mg({ id: "c", verdict: "Non compatibile", days: null, amount: null, geoScope: null, tags: [] }),
  ];
  it("verdetti filter keeps only the listed verdicts", () => {
    expect(applyFilters(list, { verdetti: ["Candidabile"] }).map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("onlyCandidabili keeps only Candidabile", () => {
    expect(applyFilters(list, { onlyCandidabili: true }).map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("maxDeadlineDays excludes null-deadline and beyond-range grants", () => {
    expect(applyFilters(list, { maxDeadlineDays: 7 }).map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("amount range excludes null amounts and out-of-range", () => {
    expect(applyFilters(list, { minAmount: 50000 }).map((m) => m.grant.id)).toEqual(["b"]);
    expect(applyFilters(list, { maxAmount: 50000 }).map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("geoScopes filter (OR within dimension)", () => {
    expect(applyFilters(list, { geoScopes: ["regionale", "nazionale"] }).map((m) => m.grant.id)).toEqual(["a", "b"]);
  });
  it("tags filter keeps grants sharing at least one tag", () => {
    expect(applyFilters(list, { tags: ["sport"] }).map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("combined filters AND across dimensions", () => {
    expect(applyFilters(list, { verdetti: ["Candidabile", "Da preparare"], maxAmount: 50000 })
      .map((m) => m.grant.id)).toEqual(["a"]);
  });
  it("empty filters return everything", () => {
    expect(applyFilters(list, {}).length).toBe(3);
  });
});

describe("applySort", () => {
  const list = [
    mg({ id: "lo", score: 30, days: 40, amount: 5000 }),
    mg({ id: "hi", score: 90, days: 5, amount: 100000 }),
    mg({ id: "mid", score: 60, days: null, amount: null }),
  ];
  it("score desc", () => {
    expect(applySort(list, "score").map((m) => m.grant.id)).toEqual(["hi", "mid", "lo"]);
  });
  it("deadline ascending with nulls last", () => {
    expect(applySort(list, "deadline").map((m) => m.grant.id)).toEqual(["hi", "lo", "mid"]);
  });
  it("amount descending with nulls last", () => {
    expect(applySort(list, "amount").map((m) => m.grant.id)).toEqual(["hi", "lo", "mid"]);
  });
});

describe("countByVerdict", () => {
  it("counts candidabili, da preparare, and total", () => {
    const list = [
      mg({ id: "a", verdict: "Candidabile" }), mg({ id: "b", verdict: "Candidabile" }),
      mg({ id: "c", verdict: "Da preparare" }), mg({ id: "d", verdict: "Bassa priorità" }),
    ];
    expect(countByVerdict(list)).toEqual({ candidabili: 2, daPreparare: 1, totale: 4 });
  });
});

describe("query-string round-trip", () => {
  it("parse(serialize(x)) === x for a populated filter set", () => {
    const filters: Filters = {
      verdetti: ["Candidabile", "Da preparare"], onlyCandidabili: true,
      maxDeadlineDays: 30, minAmount: 1000, maxAmount: 200000,
      geoScopes: ["regionale"], tags: ["sport", "giovani"],
    };
    const sort: SortKey = "deadline";
    const qs = serializeFilters(filters, sort);
    const record = Object.fromEntries(new URLSearchParams(qs));
    expect(parseFilters(record)).toEqual({ filters, sort });
  });
  it("empty filters + default sort serialize to empty string", () => {
    expect(serializeFilters({}, "score")).toBe("");
  });
  it("parseFilters defaults to score sort and empty filters on empty input", () => {
    expect(parseFilters({})).toEqual({ filters: {}, sort: "score" });
  });
  it("parseFilters reads a repeated/array param by taking the first value", () => {
    expect(parseFilters({ sort: ["amount", "score"] }).sort).toBe("amount");
  });
});
