import type { MatchedGrant } from "./match-list";
import type { Verdict, GeoScope, GrantType } from "@/lib/matching";

export type SortKey = "score" | "deadline" | "amount";

export interface Filters {
  verdetti?: Verdict[];
  onlyCandidabili?: boolean;
  maxDeadlineDays?: number;
  minAmount?: number;
  maxAmount?: number;
  geoScopes?: GeoScope[];
  tags?: string[];
  grantTypes?: GrantType[];
}

export function applyFilters(matched: MatchedGrant[], f: Filters): MatchedGrant[] {
  return matched.filter((m) => {
    if (f.verdetti && f.verdetti.length && !f.verdetti.includes(m.match.verdict)) return false;
    if (f.onlyCandidabili && m.match.verdict !== "Candidabile") return false;
    if (f.maxDeadlineDays != null) {
      const d = m.match.indicators.deadline.days;
      if (d == null || d > f.maxDeadlineDays) return false;
    }
    if (f.minAmount != null) {
      if (m.grant.amount == null || m.grant.amount < f.minAmount) return false;
    }
    if (f.maxAmount != null) {
      if (m.grant.amount == null || m.grant.amount > f.maxAmount) return false;
    }
    if (f.geoScopes && f.geoScopes.length) {
      if (m.grant.geoScope == null || !f.geoScopes.includes(m.grant.geoScope)) return false;
    }
    if (f.tags && f.tags.length) {
      if (!m.grant.tags.some((t) => f.tags!.includes(t))) return false;
    }
    if (f.grantTypes && f.grantTypes.length) {
      if (!f.grantTypes.includes(m.grant.grantType)) return false;
    }
    return true;
  });
}

export function applySort(matched: MatchedGrant[], sort: SortKey): MatchedGrant[] {
  const out = [...matched];
  if (sort === "score") {
    out.sort((a, b) => b.match.score - a.match.score);
  } else if (sort === "deadline") {
    out.sort((a, b) => nullsLast(a.match.indicators.deadline.days, b.match.indicators.deadline.days, "asc"));
  } else {
    out.sort((a, b) => nullsLast(a.grant.amount, b.grant.amount, "desc"));
  }
  return out;
}

function nullsLast(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function countByVerdict(matched: MatchedGrant[]): {
  candidabili: number; daPreparare: number; totale: number;
} {
  let candidabili = 0, daPreparare = 0;
  for (const m of matched) {
    if (m.match.verdict === "Candidabile") candidabili++;
    else if (m.match.verdict === "Da preparare") daPreparare++;
  }
  return { candidabili, daPreparare, totale: matched.length };
}

// ---- query-string round-trip -------------------------------------------------
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function list(v: string | string[] | undefined): string[] | undefined {
  const s = first(v);
  if (!s) return undefined;
  return s.split(",").filter(Boolean);
}
function num(v: string | string[] | undefined): number | undefined {
  const s = first(v);
  if (s == null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const SORTS: SortKey[] = ["score", "deadline", "amount"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): {
  filters: Filters; sort: SortKey;
} {
  const filters: Filters = {};
  const verdetti = list(sp.verdetto) as Verdict[] | undefined;
  if (verdetti) filters.verdetti = verdetti;
  if (first(sp.candidabili) === "1") filters.onlyCandidabili = true;
  if (num(sp.scadenza) != null) filters.maxDeadlineDays = num(sp.scadenza);
  if (num(sp.importoMin) != null) filters.minAmount = num(sp.importoMin);
  if (num(sp.importoMax) != null) filters.maxAmount = num(sp.importoMax);
  const geo = list(sp.geo) as GeoScope[] | undefined;
  if (geo) filters.geoScopes = geo;
  const tags = list(sp.tag);
  if (tags) filters.tags = tags;
  const grantTypes = list(sp.tipo) as GrantType[] | undefined;
  if (grantTypes) filters.grantTypes = grantTypes;

  const sortRaw = first(sp.sort) as SortKey | undefined;
  const sort: SortKey = sortRaw && SORTS.includes(sortRaw) ? sortRaw : "score";
  return { filters, sort };
}

export function serializeFilters(filters: Filters, sort: SortKey): string {
  const p = new URLSearchParams();
  // stable, alphabetical key order for deterministic URLs
  if (filters.onlyCandidabili) p.set("candidabili", "1");
  if (filters.geoScopes && filters.geoScopes.length) p.set("geo", filters.geoScopes.join(","));
  if (filters.maxAmount != null) p.set("importoMax", String(filters.maxAmount));
  if (filters.minAmount != null) p.set("importoMin", String(filters.minAmount));
  if (filters.maxDeadlineDays != null) p.set("scadenza", String(filters.maxDeadlineDays));
  if (sort !== "score") p.set("sort", sort);
  if (filters.tags && filters.tags.length) p.set("tag", filters.tags.join(","));
  if (filters.grantTypes && filters.grantTypes.length) p.set("tipo", filters.grantTypes.join(","));
  if (filters.verdetti && filters.verdetti.length) p.set("verdetto", filters.verdetti.join(","));
  return p.toString();
}
