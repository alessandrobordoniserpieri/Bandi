// app/src/lib/matching/storico-match.ts
// §2.8 — specific history match (NOT scored). Compares the entity's project history with the
// current grant on two levels and produces a badge:
//   (1) grant match  — the SAME bando in history (fuzzy name match, provider-independent);
//   (2) provider match — same provider_id but a different bando (knows the erogatore).
// Priority: Già finanziato > Già candidato > Conosce l'erogatore.
import type { Grant, HistoryBadge, HistoryBadgeKind, ProjectHistoryRow } from "./types";

const LABEL: Record<HistoryBadgeKind, string> = {
  gia_finanziato: "Già finanziato",
  gia_candidato: "Già candidato",
  conosce_erogatore: "Conosce l'erogatore",
};

const YEAR = /\b(19|20)\d{2}\b/g;
const LEGAL_SUFFIX = /\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?c\.?s\.?|onlus|aps|odv|ets)\b/g;
const EDITION = /\bedizione\b/g;

// lowercase, drop years / "edizione" / common legal suffixes / punctuation, collapse spaces.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(EDITION, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(YEAR, " ")
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

// Normalized similarity in [0,1]. Empty-after-normalization names never match.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

const NAME_THRESHOLD = 0.85;

export function matchHistory(history: ProjectHistoryRow[], grant: Grant): HistoryBadge | null {
  const nameMatched: ProjectHistoryRow[] = [];
  let providerKnown = false;

  for (const row of history) {
    const sameProvider = row.providerId != null && row.providerId === grant.providerId;
    const sameName = nameSimilarity(row.grantName, grant.title) >= NAME_THRESHOLD;
    if (sameName) nameMatched.push(row);
    else if (sameProvider) providerKnown = true; // provider match on a DIFFERENT bando
  }

  // Grant-level (same bando): outcome decides finanziato vs candidato.
  if (nameMatched.some((r) => r.outcome === "finanziato")) {
    return { kind: "gia_finanziato", label: LABEL.gia_finanziato };
  }
  if (nameMatched.length > 0) {
    // applied to this bando but not (yet) funded
    return { kind: "gia_candidato", label: LABEL.gia_candidato };
  }
  // Provider-level only: knows the erogatore from other bandi.
  if (providerKnown) {
    return { kind: "conosce_erogatore", label: LABEL.conosce_erogatore };
  }
  return null;
}
