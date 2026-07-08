// Domain enums — lowercase values align with branch-001 Postgres enums.
export type GeoScope = "comunale" | "provinciale" | "regionale" | "nazionale" | "europeo";
export type ComplexityLevel = "bassa" | "media" | "alta";
export type CapacityLevel = "Bassa" | "Media" | "Alta";
export type ProviderKind = "pubblico" | "privato" | "eu";
export type GrantStatus = "aperto" | "chiuso";
export type ProjectOutcome = "finanziato" | "non_ammesso" | "in_valutazione" | "altro";

export type Verdict =
  | "Candidabile"
  | "Da preparare"
  | "Da valutare"
  | "Bassa priorità"
  | "Non compatibile"
  | "Storico";

// The 6 answers that CALCULATE capacity (design §2.4). Never a declared level.
export interface CapacityAnswers {
  stableStaff: "0-2" | "3-10" | "11-30" | "30+";
  dedicatedAdmin: boolean;
  fundedProjects3y: "0" | "1-2" | "3-5" | "5+";
  reportingExperience: "mai" | "qualche_volta" | "regolarmente";
  annualBudget: "<20k" | "20-100k" | "100-500k" | ">500k";
  euProject: boolean;
}

// Structured document possession (design §2.5) — booleans, not text.
export interface EntityDocuments {
  statuto: boolean;
  bilancio: boolean;
  runts: boolean;
  rasd: boolean;
  durc: boolean;
  certificazioni: boolean;
}

export interface ProjectHistoryRow {
  grantName: string;
  providerId: string | null;
  year: number | null;
  outcome: ProjectOutcome;
  amount: number | null;
  kind: ProviderKind | null; // funding kind of that past grant
}

// The matching input — the subset of the ~40-field profile the engine consumes.
export interface EntityProfile {
  legalType: string;               // one of LEGAL_TYPES
  province: string;                // province code (§2 territory)
  region: string;                  // derived from province (I9)
  operatingProvinces: string[];    // extra province codes the entity works in
  themes: string[];                // subset of TAGS (§3)
  capacity: CapacityAnswers | null;// §4 — null until answered
  documents: EntityDocuments;      // §5
  publicPartners: boolean;         // §6
  privatePartners: boolean;        // §6
  projectHistory: ProjectHistoryRow[]; // §7
  fundingTypesReceived: ProviderKind[]; // §7 — pubblico/privato/eu received
  cofundingCapacity: number | null;// §7 — % the entity can co-fund
}

// The 16 extracted fields (design §4.2).
export interface Grant {
  id: string;
  title: string;
  providerId: string | null;
  providerKind: ProviderKind | null;
  deadline: string | null;         // ISO date
  status: GrantStatus;
  amount: number | null;           // €
  cofundingRequired: number | null;// %
  eligibleTypes: string[];         // subset of LEGAL_TYPES
  tags: string[];                  // subset of TAGS
  area: string | null;
  geoScope: GeoScope | null;
  complexity: ComplexityLevel | null;
  requiredDocuments: string[];     // canonical DOCUMENT_KEYS
  summary: string;
  requirements: string;
  url: string;
  beneficiaries: string;
}

export interface DimensionScore {
  value: number;
  max: number;
  note: string;
}

export type DimensionKey =
  | "themes" | "legalForm" | "territory" | "capacity" | "documents" | "trackRecord";

export interface BreakdownItem {
  key: DimensionKey;
  label: string;   // Italian
  value: number;
  max: number;
  note: string;    // Italian
}

export interface BonusItem {
  key: string;
  label: string;   // Italian
  value: number;   // +5 / +3 / -5
}

export type DeadlineColor = "verde" | "giallo" | "rosso" | "nero";
export interface DeadlineIndicator { days: number | null; color: DeadlineColor; label: string; }
export interface CofundingIndicator {
  required: number | null;
  color: "verde" | "giallo" | "rosso" | "grigio";
  label: string;
}
export type EconomicLevel = "da_verificare" | "alla_tua_portata" | "ambizioso" | "fuori_scala";
// The pure reading (§2.7A). `ratio` is null when amount or budget is missing.
export interface EconomicCoherence {
  ratio: number | null;
  level: EconomicLevel;
  label: string; // Italian badge text
}
// The indicator carried in MatchResult: the reading plus the grant amount to render.
export interface EconomicIndicator extends EconomicCoherence {
  amount: number | null;
  budgetKnown: boolean; // false → prompt the user to fill §4/§7
}
export interface Indicators {
  deadline: DeadlineIndicator;
  cofunding: CofundingIndicator;
  economic: EconomicIndicator;
}

export type HistoryBadgeKind = "gia_finanziato" | "gia_candidato" | "conosce_erogatore";
export interface HistoryBadge {
  kind: HistoryBadgeKind;
  label: string; // Italian
}

export interface MatchResult {
  score: number;               // final, 0..100
  baseScore: number;           // sum of the 6 dimensions, pre-bonus
  verdict: Verdict;
  breakdown: BreakdownItem[];  // exactly 6
  bonuses: BonusItem[];
  indicators: Indicators;
  historyBadge: HistoryBadge | null; // §2.8 — specific history, NOT scored
  missingDocuments: string[];
  actions: string[];           // Italian
}
