// app/src/lib/profile/constants.ts
// Option lists and section metadata for the profile UI. Italian labels (UI),
// values are the tokens persisted to the DB. Matching-relevant vocabularies
// (LEGAL_TYPES, TAGS, PROVINCES) live in @/lib/matching and are not duplicated.

export const SECTION_KEYS = [
  "identity", "territory", "themes", "capacity",
  "documents", "partnerships", "history", "contacts",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type SectionPriority = "obbligatoria" | "suggerita" | "dopo";

export const SECTION_META: Record<
  SectionKey,
  { n: number; label: string; priority: SectionPriority; points: number }
> = {
  identity:     { n: 1, label: "Identità",             priority: "obbligatoria", points: 22 },
  territory:    { n: 2, label: "Territorio",           priority: "obbligatoria", points: 18 },
  themes:       { n: 3, label: "Temi e attività",      priority: "obbligatoria", points: 28 },
  capacity:     { n: 4, label: "Capacità gestionale",  priority: "suggerita",    points: 14 },
  documents:    { n: 5, label: "Documenti e registri", priority: "dopo",         points: 12 },
  partnerships: { n: 6, label: "Partnership",          priority: "dopo",         points: 0  },
  history:      { n: 7, label: "Storico e finanze",    priority: "dopo",         points: 6  },
  contacts:     { n: 8, label: "Contatti",             priority: "dopo",         points: 0  },
};

// §3 main beneficiaries (design §3 sezione 3).
export const BENEFICIARY_OPTIONS = [
  "minori", "giovani", "anziani", "disabili", "famiglie",
  "migranti", "donne", "comunità", "tutti",
] as const;

// §2 operating scope — aligned to the matching GeoScope vocabulary.
export const OPERATING_SCOPE_OPTIONS = [
  "comunale", "provinciale", "regionale", "nazionale", "europeo",
] as const;

// §7 project outcome — aligned to matching ProjectOutcome.
export const OUTCOME_OPTIONS = [
  "finanziato", "non_ammesso", "in_valutazione", "altro",
] as const;

// Readable Italian labels — never show the raw snake_case token on screen (concept §6.3).
export const OUTCOME_LABELS: Record<(typeof OUTCOME_OPTIONS)[number], string> = {
  finanziato: "Finanziato",
  non_ammesso: "Non ammesso",
  in_valutazione: "In valutazione",
  altro: "Altro",
};

// §7 co-funding capacity (%). Stored as int.
export const COFUNDING_OPTIONS = [0, 10, 20, 30, 50] as const;

// §7 income sources (multi-select).
export const INCOME_SOURCE_OPTIONS = [
  "quote_associative", "donazioni", "5x1000", "contributi_pubblici",
  "attivita_commerciale", "sponsor", "eventi",
] as const;

// Readable Italian labels — never show the raw snake_case token on screen (concept §6.3).
export const INCOME_SOURCE_LABELS: Record<(typeof INCOME_SOURCE_OPTIONS)[number], string> = {
  quote_associative: "Quote associative",
  donazioni: "Donazioni",
  "5x1000": "5x1000",
  contributi_pubblici: "Contributi pubblici",
  attivita_commerciale: "Attività commerciale",
  sponsor: "Sponsor",
  eventi: "Eventi",
};

// §4 reporting experience — aligned to matching CapacityAnswers.reportingExperience.
export const REPORTING_EXPERIENCE_OPTIONS = ["mai", "qualche_volta", "regolarmente"] as const;

// Readable Italian labels — never show the raw snake_case token on screen (concept §6.3).
export const REPORTING_EXPERIENCE_LABELS: Record<(typeof REPORTING_EXPERIENCE_OPTIONS)[number], string> = {
  mai: "Mai",
  qualche_volta: "Qualche volta",
  regolarmente: "Regolarmente",
};
