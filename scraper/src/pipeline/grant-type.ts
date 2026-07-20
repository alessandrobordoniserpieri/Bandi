// scraper/src/pipeline/grant-type.ts
// Classifies a grant's NATURE from its title/summary, independent of archetype. Design:
// docs/superpowers/specs/2026-07-18-grant-type-classification-design.md
export const GRANT_TYPES = ["bando", "co_progettazione", "amministrativo"] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

// Anchored to the START of the title (optionally after "avviso di/della/sul(la)"): a real bando
// that merely MENTIONS "proroga" mid-title (e.g. describing an eventual future extension) must
// not be discarded — only a notice whose actual SUBJECT is the administrative modification.
const ADMIN_NOTICE_RE =
  /^(?:avviso\s+(?:di|della|sul(?:la)?)\s+)?(?:proroga|differimento|rettifica|errata\s+corrige|revoca|annullamento|modifica)\b/i;

// Checked against title + summary combined (co-progettazione language can live in either).
// Separator between "co" and the root word is optional and can be a hyphen or a space, covering
// "co-progettazione", "co progettazione", "coprogettazione" (and -programmazione variants).
// "manifestazione di interesse" is included: in the Terzo Settore domain it is almost always a
// precursor to co-progettazione, and treating the ambiguous case as co_progettazione (visible +
// labeled) is safer than amministrativo (an irreversible discard).
const CO_PROGETTAZIONE_RE = /co[-\s]?progettazione|co[-\s]?programmazione|manifestazione\s+di\s+interesse/i;

export function classifyGrantType(title: string, summary: string | null): GrantType {
  if (ADMIN_NOTICE_RE.test(title.trim())) return "amministrativo";
  const haystack = `${title} ${summary ?? ""}`;
  if (CO_PROGETTAZIONE_RE.test(haystack)) return "co_progettazione";
  return "bando";
}
