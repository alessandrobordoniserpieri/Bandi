# Matching Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the `app/src/lib/matching/` engine to the v2 design — 6 scored dimensions summing to exactly 100 points, plus non-scored bonuses and indicators — replacing the v1 fragile substring/regex/textOverlap logic with structured, deterministic, fully-tested code.

**Architecture:** A pure, synchronous, I/O-free module. One deep public function `calculateMatch(profile, grant) → MatchResult`. Each of the 6 dimensions is an isolated pure function under `dimensions/`, composed by `calculate-match.ts`. Data tables (legal-type groups, province→region, capacity matrix, weights) live in `constants.ts`. No persistence, no AI, no Supabase — the module is testable in complete isolation and developed in parallel to branch 001.

**Tech Stack:** TypeScript (strict), Vitest 4. Next.js 16 app lives around it but this branch touches only `src/lib/matching/`, `__tests__/`, and `docs/`.

## Global Constraints

- **Code & comments in English; user-facing strings (notes, labels, actions) in Italian.** (Design doc §7)
- **The 6 dimension weights sum to exactly 100:** `themes 28 + legalForm 22 + territory 18 + capacity 14 + documents 12 + trackRecord 6 = 100`. (Invariant I2)
- **Missing data never zeroes a dimension — it yields the documented neutral value.** (Invariant I8)
- **Matching is never persisted; recomputed every call. No caching.** (ADR-003, Invariant I10)
- **Capacity is always *calculated* from 6 questions, never a self-declared field.** (ADR-004, Invariant I3)
- **Region is always *derived* from province via `PROVINCE_TO_REGION`, never entered by hand.** (Invariant I9)
- **Providers/funding are referenced by structured value, never free text.** (ADR-005, Invariant I4)
- **Enum string values are lowercase** to align with the branch-001 Postgres enums (`geo_scope`, `complexity_level`, `capacity_level`, `provider_kind`, `grant_status`).
- Run tests with `npx vitest run`; typecheck with `npx tsc --noEmit`. Both must be green before every commit. All commands run from `app/`.
- Acceptance: no residual references to `textOverlap`, `legalTypeKey`, `minCapacity`, `documentFiles`, `document-profile`. `breakdown` always has exactly 6 items and `sum(max) === 100`.

---

## Decisioni di interpretazione (oltre il design doc — da validare)

The design doc gives score *anchors* but not always the interpolation rule. These choices hit every anchor exactly; flagged here for review. If any is wrong, only the affected dimension file + its test change.

1. **Themes formula.** `score = round(28 × sharedTags / grant.tags.length)`, clamped 0–28. Denominator is the *grant's* tag count (the grant defines the relevant themes). If the grant has **no** tags → neutral `19` (≈ 0.667×28, matching the ~⅔ neutral used for territory 12/18 and documents 8/12).
2. **Capacity aggregation** (no numeric guidance in doc). Point system, total 0–15: stableStaff `{0-2:0, 3-10:1, 11-30:2, 30+:3}` · dedicatedAdmin `{no:0, yes:2}` · fundedProjects3y `{0:0, 1-2:1, 3-5:2, 5+:3}` · reportingExperience `{mai:0, qualche_volta:1, regolarmente:2}` · annualBudget `{<20k:0, 20-100k:1, 100-500k:2, >500k:3}` · euProject `{no:0, yes:2}`. Thresholds: **0–4 → Bassa, 5–9 → Media, 10–15 → Alta**. Any missing answer → `null`.
3. **Capacity neutral.** When capacity is `null` **or** grant complexity is `null`, dimension 4 = neutral `9` (≈0.667×14).
4. **Documents vocabulary.** Canonical keys: `statuto, bilancio, runts, rasd, durc, certificazioni`. Entity possession is structured booleans (not text). `score = round(12 × possessed / required)`, neutral `8` when the grant lists no required docs.
5. **Territory with `geoScope` absent.** Structured approach (no text parsing of `area`): grant with **no** `geoScope` and **no** `area` → neutral `12`; grant with `area` but no `geoScope` → uncertainty `5`.
6. **Partner bonus trigger.** No structured "requires partnership" field exists among the 16 grant fields, so the bonus (+5) fires when the entity has partners **and** `grant.complexity === 'alta'` (high-complexity grants are the partnership-driven ones). Flagged as a proxy.
7. **Deadline indicator bands.** closed → `nero`; `days < 7` → `rosso`; `7 ≤ days < 15` → `giallo`; `days ≥ 15` → `verde`.

---

## File Structure

```
app/src/lib/matching/
  types.ts                 REWRITE  EntityProfile, Grant, MatchResult, Verdict, enums
  constants.ts             REWRITE  LEGAL_TYPES(62), TAGS(47), LEGAL_TYPE_GROUPS(8),
                                    TAG_MACRO_AREAS, PROVINCES(107), PROVINCE_TO_REGION,
                                    WEIGHTS, CAPACITY_MATRIX, DOCUMENT_KEYS, thresholds
  helpers.ts               SHRINK   keep deadlineDays, isClosedGrant only
  dimensions/themes.ts        NEW   scoreThemes(profile, grant) → DimensionScore
  dimensions/legal-form.ts    NEW   scoreLegalForm(...)
  dimensions/territory.ts     NEW   scoreTerritory(...)
  dimensions/capacity.ts      NEW   calculateCapacity(answers), scoreCapacity(...)
  dimensions/documents.ts     NEW   scoreDocuments(...) → {score, missing[]}
  dimensions/track-record.ts  NEW   scoreTrackRecord(...)
  bonuses.ts                  NEW   computeBonuses(...) → BonusItem[]
  indicators.ts               NEW   deadlineIndicator, cofundingIndicator
  calculate-match.ts       REWRITE  orchestration: 6 dims + bonuses + clamp
  breakdown.ts             REWRITE  6 BreakdownItem from dimension scores
  actions.ts               REWRITE  Italian checklist incl. "Per candidarti ti manca: …"
  verdict.ts               REWRITE  6 thresholds (§2.9)
  index.ts                 REWRITE  barrel of the new public surface
  document-profile.ts      DELETE
  __tests__/calculate-match.test.ts  REWRITE  interface-level + I2/I8 invariants
  __tests__/capacity.test.ts         NEW
  __tests__/verdict.test.ts          NEW
docs/adr/0003-rule-based-matching.md   NEW
docs/adr/0004-calculated-capacity.md   NEW
```

Every dimension function returns the same small shape so the orchestrator is uniform:

```ts
export interface DimensionScore {
  value: number;   // points awarded, 0..max
  max: number;     // dimension weight
  note: string;    // short Italian explanation for the breakdown
}
```

---

### Task 1: Types + constants foundation

**Files:**
- Rewrite: `app/src/lib/matching/types.ts`
- Rewrite: `app/src/lib/matching/constants.ts`
- Test: `app/src/lib/matching/__tests__/constants.test.ts` (new)

**Interfaces:**
- Produces (consumed by every later task): the enums `GeoScope`, `ComplexityLevel`, `CapacityLevel`, `ProviderKind`, `Verdict`; interfaces `EntityProfile`, `CapacityAnswers`, `EntityDocuments`, `ProjectHistoryRow`, `Grant`, `DimensionScore`, `BreakdownItem`, `BonusItem`, `Indicators`, `MatchResult`; constants `LEGAL_TYPES`, `TAGS`, `LEGAL_TYPE_GROUPS`, `TAG_MACRO_AREAS`, `PROVINCES`, `PROVINCE_TO_REGION`, `WEIGHTS`, `CAPACITY_MATRIX`, `DOCUMENT_KEYS`, `VERDICT_THRESHOLDS`; helper `regionForProvince(code)` and `groupForLegalType(type)`.

- [ ] **Step 1: Write the failing test** — `__tests__/constants.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/constants.test.ts`
Expected: FAIL — module `../constants` exports don't exist yet.

- [ ] **Step 3: Write `types.ts`**

```ts
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
export interface Indicators {
  deadline: DeadlineIndicator;
  cofunding: CofundingIndicator;
}

export interface MatchResult {
  score: number;               // final, 0..100
  baseScore: number;           // sum of the 6 dimensions, pre-bonus
  verdict: Verdict;
  breakdown: BreakdownItem[];  // exactly 6
  bonuses: BonusItem[];
  indicators: Indicators;
  missingDocuments: string[];
  actions: string[];           // Italian
}
```

- [ ] **Step 4: Write `constants.ts`**

Keep the existing `LEGAL_TYPES` (62) and `TAGS` (47) arrays verbatim from the current file. Add the rest:

```ts
import type { CapacityLevel, ComplexityLevel, DimensionKey } from "./types";

export const LEGAL_TYPES = [ /* … 62 entries, copied verbatim from v1 … */ ] as const;
export const TAGS = [ /* … 47 entries, copied verbatim from v1 … */ ] as const;

export const WEIGHTS: Record<DimensionKey, number> = {
  themes: 28, legalForm: 22, territory: 18, capacity: 14, documents: 12, trackRecord: 6,
};

// Neutral values when the grant carries no data for a dimension (I8).
export const NEUTRAL = { themes: 19, territory: 12, capacity: 9, documents: 8 } as const;

export const DOCUMENT_KEYS = ["statuto", "bilancio", "runts", "rasd", "durc", "certificazioni"] as const;
export type DocumentKey = (typeof DOCUMENT_KEYS)[number];

// 8 compatibility groups (design §2.2). Values are short subtype tokens for display.
export const LEGAL_TYPE_GROUPS = {
  SPORTIVI: ["ASD", "SSD", "SSD a r.l.", "ASD/SSD iscritta RASD"],
  PROMOZIONE: ["EPS", "FSN", "DSA", "AB", "Comitato territoriale EPS/FSN"],
  TERZO_SETT: ["APS", "ODV", "ETS", "Rete associativa ETS", "ONLUS", "ONG/OSC"],
  COOPERATIVE: ["Coop sociale A", "Coop sociale B", "Consorzio coop", "Impresa sociale"],
  FONDAZIONI: ["Fondazione ETS", "di comunità", "bancaria", "privata", "pubblica"],
  ENTI_PUBBL: ["Comune", "Unione Comuni", "Provincia", "Regione", "Ente pubblico"],
  FORMAZIONE: ["Istituto scolastico", "Università", "Centro ricerca", "Ente formazione"],
  IMPRESE: ["Impresa", "PMI", "Start-up", "Società benefit"],
} as const;
export type LegalGroup = keyof typeof LEGAL_TYPE_GROUPS;

// Full map from each of the 62 LEGAL_TYPES to its group (or null when it fits none).
// Keyed by the exact LEGAL_TYPES string.
export const LEGAL_TYPE_TO_GROUP: Record<string, LegalGroup | null> = {
  "ASD - Associazione Sportiva Dilettantistica": "SPORTIVI",
  "SSD - Società Sportiva Dilettantistica": "SPORTIVI",
  "SSD a r.l. - Società Sportiva Dilettantistica a responsabilità limitata": "SPORTIVI",
  "ASD/SSD iscritta RASD": "SPORTIVI",
  "EPS - Ente di Promozione Sportiva": "PROMOZIONE",
  "FSN - Federazione Sportiva Nazionale": "PROMOZIONE",
  "DSA - Disciplina Sportiva Associata": "PROMOZIONE",
  "AB - Associazione Benemerita": "PROMOZIONE",
  "Comitato territoriale EPS/FSN": "PROMOZIONE",
  "Società sportiva professionistica": "SPORTIVI",
  "Associazione non riconosciuta": "TERZO_SETT",
  "Associazione riconosciuta": "TERZO_SETT",
  "APS - Associazione di Promozione Sociale": "TERZO_SETT",
  "ODV - Organizzazione di Volontariato": "TERZO_SETT",
  "ETS - Ente del Terzo Settore": "TERZO_SETT",
  "Rete associativa ETS": "TERZO_SETT",
  "Ente filantropico": "TERZO_SETT",
  "Società di mutuo soccorso": "TERZO_SETT",
  "ONLUS": "TERZO_SETT",
  "ONG / OSC": "TERZO_SETT",
  "Cooperativa sociale tipo A": "COOPERATIVE",
  "Cooperativa sociale tipo B": "COOPERATIVE",
  "Consorzio di cooperative sociali": "COOPERATIVE",
  "Impresa sociale": "COOPERATIVE",
  "Fondazione ETS": "FONDAZIONI",
  "Fondazione di comunità": "FONDAZIONI",
  "Fondazione di origine bancaria": "FONDAZIONI",
  "Fondazione privata": "FONDAZIONI",
  "Fondazione pubblica": "FONDAZIONI",
  "Comitato": "TERZO_SETT",
  "Comitato organizzatore": "TERZO_SETT",
  "Pro Loco": "TERZO_SETT",
  "Ente ecclesiastico civilmente riconosciuto": "TERZO_SETT",
  "Parrocchia / Oratorio": "TERZO_SETT",
  "Ente religioso": "TERZO_SETT",
  "Comune": "ENTI_PUBBL",
  "Unione di Comuni": "ENTI_PUBBL",
  "Provincia / Città Metropolitana": "ENTI_PUBBL",
  "Regione": "ENTI_PUBBL",
  "Azienda pubblica di servizi alla persona": "ENTI_PUBBL",
  "Azienda sanitaria / AUSL": "ENTI_PUBBL",
  "Istituto scolastico statale": "FORMAZIONE",
  "Istituto scolastico paritario": "FORMAZIONE",
  "Università": "FORMAZIONE",
  "Centro di ricerca": "FORMAZIONE",
  "Ente di formazione accreditato": "FORMAZIONE",
  "Ente pubblico": "ENTI_PUBBL",
  "Ente locale": "ENTI_PUBBL",
  "Soggetto gestore impianto sportivo": "SPORTIVI",
  "Gestore centro sportivo": "SPORTIVI",
  "Impresa": "IMPRESE",
  "PMI": "IMPRESE",
  "Start-up innovativa": "IMPRESE",
  "Società benefit": "IMPRESE",
  "Associazione di categoria": "TERZO_SETT",
  "Camera di Commercio": "ENTI_PUBBL",
  "Sindacato / organizzazione datoriale": "TERZO_SETT",
  "Gruppo informale": null,
  "Raggruppamento temporaneo / ATS": null,
  "Partner tecnico": null,
  "Partner istituzionale": null,
  "Altro": null,
};

export function groupForLegalType(type: string): LegalGroup | null {
  return LEGAL_TYPE_TO_GROUP[type] ?? null;
}

// Macro-areas over the 47 tags — predisposition for future partial match. Every tag appears once.
export const TAG_MACRO_AREAS: Record<string, string[]> = {
  sport: ["sport", "outdoor", "impianti sportivi", "eventi", "benessere"],
  giovani: ["giovani", "scuola", "educazione", "NEET", "disagio giovanile", "povertà educativa", "centri estivi", "servizio civile", "comunità educante", "comunità educanti"],
  inclusione: ["inclusione", "disabilità", "anziani", "migranti", "donne", "minori", "pari opportunità", "accessibilità", "contrasto povertà"],
  welfare: ["welfare", "salute", "salute mentale", "prevenzione", "famiglie", "housing sociale"],
  comunita: ["comunità", "quartieri", "periferie", "rigenerazione urbana", "volontariato", "terzo settore", "co-progettazione", "capacity building"],
  cultura: ["cultura", "turismo", "ambiente", "sostenibilità"],
  innovazione: ["digitale", "innovazione", "innovazione sociale", "formazione", "occupazione"],
};

// Capacity × complexity scoring matrix (design §2.4). Rows = entity capacity, cols = grant complexity.
export const CAPACITY_MATRIX: Record<CapacityLevel, Record<ComplexityLevel, number>> = {
  Bassa: { bassa: 14, media: 7, alta: 2 },
  Media: { bassa: 14, media: 14, alta: 8 },
  Alta: { bassa: 14, media: 14, alta: 14 },
};

// Verdict thresholds (design §2.9).
export const VERDICT_THRESHOLDS = { candidabile: 75, daValutare: 50, bassaPriorita: 30 } as const;

// 107 provinces grouped by their region → the complete PROVINCE_TO_REGION map (I9).
const REGION_PROVINCES: Record<string, string[]> = {
  "Abruzzo": ["AQ", "CH", "PE", "TE"],
  "Basilicata": ["MT", "PZ"],
  "Calabria": ["CS", "CZ", "KR", "RC", "VV"],
  "Campania": ["AV", "BN", "CE", "NA", "SA"],
  "Emilia-Romagna": ["BO", "FC", "FE", "MO", "PC", "PR", "RA", "RE", "RN"],
  "Friuli-Venezia Giulia": ["GO", "PN", "TS", "UD"],
  "Lazio": ["FR", "LT", "RI", "RM", "VT"],
  "Liguria": ["GE", "IM", "SP", "SV"],
  "Lombardia": ["BG", "BS", "CO", "CR", "LC", "LO", "MB", "MI", "MN", "PV", "SO", "VA"],
  "Marche": ["AN", "AP", "FM", "MC", "PU"],
  "Molise": ["CB", "IS"],
  "Piemonte": ["AL", "AT", "BI", "CN", "NO", "TO", "VB", "VC"],
  "Puglia": ["BA", "BR", "BT", "FG", "LE", "TA"],
  "Sardegna": ["CA", "NU", "OR", "SS", "SU"],
  "Sicilia": ["AG", "CL", "CT", "EN", "ME", "PA", "RG", "SR", "TP"],
  "Toscana": ["AR", "FI", "GR", "LI", "LU", "MS", "PI", "PO", "PT", "SI"],
  "Trentino-Alto Adige": ["BZ", "TN"],
  "Umbria": ["PG", "TR"],
  "Valle d'Aosta": ["AO"],
  "Veneto": ["BL", "PD", "RO", "TV", "VE", "VI", "VR"],
};

export const PROVINCE_TO_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_PROVINCES).flatMap(([region, codes]) => codes.map((c) => [c, region])),
);

export const PROVINCES = Object.keys(PROVINCE_TO_REGION) as readonly string[];

export function regionForProvince(code: string): string | null {
  return PROVINCE_TO_REGION[code] ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/constants.test.ts`
Expected: PASS (7 tests). Then `npx tsc --noEmit` — note `types.ts`/`constants.ts` will typecheck but the rest of the module still imports the old surface; that's fixed in later tasks, so **do not run the full suite yet**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matching/types.ts src/lib/matching/constants.ts src/lib/matching/__tests__/constants.test.ts
git commit -m "feat(matching): v2 types and constants (groups, province map, weights, capacity matrix)"
```

---

### Task 2: Themes dimension (28 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/themes.ts`
- Test: `app/src/lib/matching/__tests__/themes.test.ts`

**Interfaces:**
- Consumes: `EntityProfile`, `Grant`, `DimensionScore` (Task 1); `WEIGHTS`, `NEUTRAL`.
- Produces: `scoreThemes(profile: EntityProfile, grant: Grant): DimensionScore`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreThemes } from "../dimensions/themes";
import type { EntityProfile, Grant } from "../types";

const p = (themes: string[]) => ({ themes } as EntityProfile);
const g = (tags: string[]) => ({ tags } as Grant);

describe("scoreThemes", () => {
  it("full coverage of grant themes → 28", () => {
    expect(scoreThemes(p(["sport", "giovani"]), g(["sport", "giovani"])).value).toBe(28);
  });
  it("half coverage → 14", () => {
    expect(scoreThemes(p(["sport"]), g(["sport", "giovani"])).value).toBe(14);
  });
  it("no shared tags → 0", () => {
    expect(scoreThemes(p(["cultura"]), g(["sport", "giovani"])).value).toBe(0);
  });
  it("grant with no tags → neutral 19", () => {
    expect(scoreThemes(p(["sport"]), g([])).value).toBe(19);
  });
  it("never exceeds 28 when entity has extra themes", () => {
    const r = scoreThemes(p(["sport", "giovani", "cultura"]), g(["sport"]));
    expect(r.value).toBe(28);
    expect(r.max).toBe(28);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/themes.test.ts`
Expected: FAIL — `scoreThemes` not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/themes.ts`

```ts
import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL } from "../constants";

export function scoreThemes(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.themes;
  const grantTags = grant.tags ?? [];
  if (grantTags.length === 0) {
    return { value: NEUTRAL.themes, max, note: "il bando non specifica temi" };
  }
  const shared = (profile.themes ?? []).filter((t) => grantTags.includes(t));
  const value = Math.min(max, Math.round((shared.length / grantTags.length) * max));
  const note = shared.length
    ? `${shared.length} tema/i in comune su ${grantTags.length}`
    : "nessun tema in comune";
  return { value, max, note };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/themes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/themes.ts src/lib/matching/__tests__/themes.test.ts
git commit -m "feat(matching): themes dimension (28pt)"
```

---

### Task 3: Legal form dimension (22 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/legal-form.ts`
- Test: `app/src/lib/matching/__tests__/legal-form.test.ts`

**Interfaces:**
- Consumes: `groupForLegalType`, `WEIGHTS` (Task 1).
- Produces: `scoreLegalForm(profile: EntityProfile, grant: Grant): DimensionScore`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/legal-form.test.ts`
Expected: FAIL — `scoreLegalForm` not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/legal-form.ts`

```ts
import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, groupForLegalType } from "../constants";

export function scoreLegalForm(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.legalForm;
  const eligible = grant.eligibleTypes ?? [];
  if (eligible.length === 0) {
    return { value: max, max, note: "bando aperto a tutte le forme giuridiche" };
  }
  if (eligible.includes(profile.legalType)) {
    return { value: max, max, note: "forma giuridica ammessa" };
  }
  const myGroup = groupForLegalType(profile.legalType);
  if (myGroup && eligible.some((t) => groupForLegalType(t) === myGroup)) {
    return { value: Math.round(max / 2), max, note: "gruppo compatibile, sottotipo diverso" };
  }
  return { value: 0, max, note: "forma giuridica non ammessa" };
}
```

Note: `Math.round(22 / 2) === 11`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/legal-form.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/legal-form.ts src/lib/matching/__tests__/legal-form.test.ts
git commit -m "feat(matching): legal-form dimension by 8 compatibility groups (22pt)"
```

---

### Task 4: Territory dimension (18 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/territory.ts`
- Test: `app/src/lib/matching/__tests__/territory.test.ts`

**Interfaces:**
- Consumes: `regionForProvince`, `WEIGHTS`, `NEUTRAL` (Task 1).
- Produces: `scoreTerritory(profile: EntityProfile, grant: Grant): DimensionScore`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreTerritory } from "../dimensions/territory";
import type { EntityProfile, Grant, GeoScope } from "../types";

const base = { province: "RN", region: "Emilia-Romagna", operatingProvinces: [] as string[] };
const p = (o: Partial<EntityProfile> = {}) => ({ ...base, ...o } as EntityProfile);
const g = (geoScope: GeoScope | null, area: string | null = null) => ({ geoScope, area } as Grant);

describe("scoreTerritory", () => {
  it("nazionale → 18", () => { expect(scoreTerritory(p(), g("nazionale")).value).toBe(18); });
  it("europeo → 18", () => { expect(scoreTerritory(p(), g("europeo")).value).toBe(18); });
  it("regionale same region → 18", () => { expect(scoreTerritory(p(), g("regionale", "Emilia-Romagna")).value).toBe(18); });
  it("regionale different region → 0", () => { expect(scoreTerritory(p(), g("regionale", "Sicilia")).value).toBe(0); });
  it("provinciale same province → 18", () => { expect(scoreTerritory(p(), g("provinciale", "Rimini")).value).toBe(18); });
  it("provinciale via operatingProvinces → 18", () => {
    expect(scoreTerritory(p({ operatingProvinces: ["BO"] }), g("provinciale", "BO")).value).toBe(18);
  });
  it("provinciale different province → 0", () => { expect(scoreTerritory(p(), g("provinciale", "Palermo")).value).toBe(0); });
  it("no geoScope and no area → neutral 12", () => { expect(scoreTerritory(p(), g(null, null)).value).toBe(12); });
  it("area present but no geoScope → uncertainty 5", () => { expect(scoreTerritory(p(), g(null, "qualche testo")).value).toBe(5); });
});
```

Note: the grant's regional/provincial scope must be matched **structurally**. Encode the grant's target region/province via `grant.area` holding the region name (regional) or a province code (provincial), matching what the scraper produces. The test passes region **names** for regional and province **codes** for provincial; the implementation resolves accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/territory.test.ts`
Expected: FAIL — `scoreTerritory` not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/territory.ts`

```ts
import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL, regionForProvince } from "../constants";

export function scoreTerritory(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.territory;

  // No structured territorial data → neutral / uncertainty.
  if (!grant.geoScope) {
    return grant.area
      ? { value: 5, max, note: "ambito territoriale incerto" }
      : { value: NEUTRAL.territory, max, note: "il bando non specifica il territorio" };
  }

  if (grant.geoScope === "nazionale" || grant.geoScope === "europeo") {
    return { value: max, max, note: `bando ${grant.geoScope}, valido per tutti` };
  }

  const entityProvinces = [profile.province, ...(profile.operatingProvinces ?? [])].filter(Boolean);
  const entityRegions = new Set(entityProvinces.map(regionForProvince).filter(Boolean) as string[]);

  if (grant.geoScope === "regionale") {
    const match = grant.area != null && entityRegions.has(grant.area);
    return match
      ? { value: max, max, note: "stessa regione dell'ente" }
      : { value: 0, max, note: "regione diversa" };
  }

  // comunale | provinciale → match by province code
  const match = grant.area != null && entityProvinces.includes(grant.area);
  return match
    ? { value: max, max, note: "stessa provincia dell'ente" }
    : { value: 0, max, note: "provincia diversa" };
}
```

Note the test uses `area: "Rimini"` for RN province — adjust the provincial test to pass the **code** `"RN"` (fix the test to use codes for provincial cases; region **names** for regional). Update the two provincial-match tests to `g("provinciale", "RN")` and keep the operating-provinces test as `"BO"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/territory.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/territory.ts src/lib/matching/__tests__/territory.test.ts
git commit -m "feat(matching): structured territory dimension by province/region (18pt)"
```

---

### Task 5: Capacity dimension (14 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/capacity.ts`
- Test: `app/src/lib/matching/__tests__/capacity.test.ts`

**Interfaces:**
- Consumes: `CapacityAnswers`, `CapacityLevel`, `ComplexityLevel`, `EntityProfile`, `Grant`, `DimensionScore`; `CAPACITY_MATRIX`, `WEIGHTS`, `NEUTRAL`.
- Produces: `calculateCapacity(answers: CapacityAnswers | null): CapacityLevel | null`; `scoreCapacity(profile: EntityProfile, grant: Grant): DimensionScore`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { calculateCapacity, scoreCapacity } from "../dimensions/capacity";
import type { CapacityAnswers, EntityProfile, Grant } from "../types";

const answers = (o: Partial<CapacityAnswers> = {}): CapacityAnswers => ({
  stableStaff: "0-2", dedicatedAdmin: false, fundedProjects3y: "0",
  reportingExperience: "mai", annualBudget: "<20k", euProject: false, ...o,
});

describe("calculateCapacity", () => {
  it("all-minimum answers → Bassa (0 pts)", () => {
    expect(calculateCapacity(answers())).toBe("Bassa");
  });
  it("all-maximum answers → Alta (15 pts)", () => {
    expect(calculateCapacity(answers({
      stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+",
      reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true,
    }))).toBe("Alta");
  });
  it("mid answers → Media", () => {
    expect(calculateCapacity(answers({
      stableStaff: "3-10", dedicatedAdmin: true, fundedProjects3y: "1-2",
      reportingExperience: "qualche_volta", annualBudget: "20-100k", euProject: false,
    }))).toBe("Media"); // 1+2+1+1+1+0 = 6
  });
  it("null answers → null", () => {
    expect(calculateCapacity(null)).toBeNull();
  });
});

describe("scoreCapacity", () => {
  const p = (a: CapacityAnswers | null) => ({ capacity: a } as EntityProfile);
  const g = (complexity: Grant["complexity"]) => ({ complexity } as Grant);
  it("Bassa capacity × alta complexity → 2", () => {
    expect(scoreCapacity(p(answers()), g("alta")).value).toBe(2);
  });
  it("Alta capacity × alta complexity → 14", () => {
    const high = answers({ stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+", reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true });
    expect(scoreCapacity(p(high), g("alta")).value).toBe(14);
  });
  it("capacity null → neutral 9", () => {
    expect(scoreCapacity(p(null), g("alta")).value).toBe(9);
  });
  it("complexity null → neutral 9", () => {
    expect(scoreCapacity(p(answers()), g(null)).value).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/capacity.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/capacity.ts`

```ts
import type {
  CapacityAnswers, CapacityLevel, EntityProfile, Grant, DimensionScore,
} from "../types";
import { CAPACITY_MATRIX, WEIGHTS, NEUTRAL } from "../constants";

const STAFF = { "0-2": 0, "3-10": 1, "11-30": 2, "30+": 3 } as const;
const FUNDED = { "0": 0, "1-2": 1, "3-5": 2, "5+": 3 } as const;
const REPORT = { mai: 0, qualche_volta: 1, regolarmente: 2 } as const;
const BUDGET = { "<20k": 0, "20-100k": 1, "100-500k": 2, ">500k": 3 } as const;

export function calculateCapacity(a: CapacityAnswers | null): CapacityLevel | null {
  if (!a) return null;
  const points =
    STAFF[a.stableStaff] +
    (a.dedicatedAdmin ? 2 : 0) +
    FUNDED[a.fundedProjects3y] +
    REPORT[a.reportingExperience] +
    BUDGET[a.annualBudget] +
    (a.euProject ? 2 : 0);
  if (points <= 4) return "Bassa";
  if (points <= 9) return "Media";
  return "Alta";
}

export function scoreCapacity(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.capacity;
  const level = calculateCapacity(profile.capacity);
  if (level === null || grant.complexity == null) {
    return { value: NEUTRAL.capacity, max, note: "capacità o complessità non disponibili" };
  }
  const value = CAPACITY_MATRIX[level][grant.complexity];
  return { value, max, note: `capacità ${level} vs complessità ${grant.complexity}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/capacity.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/capacity.ts src/lib/matching/__tests__/capacity.test.ts
git commit -m "feat(matching): calculated capacity + capacity×complexity dimension (14pt)"
```

---

### Task 6: Documents dimension (12 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/documents.ts`
- Test: `app/src/lib/matching/__tests__/documents.test.ts`

**Interfaces:**
- Consumes: `EntityDocuments`, `EntityProfile`, `Grant`, `DimensionScore`, `DocumentKey`; `WEIGHTS`, `NEUTRAL`, `DOCUMENT_KEYS`.
- Produces: `scoreDocuments(profile, grant): DimensionScore & { missing: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreDocuments } from "../dimensions/documents";
import type { EntityDocuments, EntityProfile, Grant } from "../types";

const none: EntityDocuments = { statuto: false, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false };
const p = (docs: Partial<EntityDocuments>) => ({ documents: { ...none, ...docs } } as EntityProfile);
const g = (requiredDocuments: string[]) => ({ requiredDocuments } as Grant);

describe("scoreDocuments", () => {
  it("4/4 possessed → 12", () => {
    const r = scoreDocuments(p({ statuto: true, bilancio: true, runts: true, durc: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(12);
    expect(r.missing).toEqual([]);
  });
  it("3/4 possessed → 9 and lists the missing one", () => {
    const r = scoreDocuments(p({ statuto: true, bilancio: true, runts: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(9);
    expect(r.missing).toEqual(["durc"]);
  });
  it("1/4 possessed → 3", () => {
    const r = scoreDocuments(p({ statuto: true }), g(["statuto", "bilancio", "runts", "durc"]));
    expect(r.value).toBe(3);
  });
  it("grant lists no documents → neutral 8", () => {
    expect(scoreDocuments(p({}), g([])).value).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/documents.test.ts`
Expected: FAIL — `scoreDocuments` not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/documents.ts`

```ts
import type { EntityProfile, Grant, DimensionScore, DocumentKey } from "../types";
import { WEIGHTS, NEUTRAL, DOCUMENT_KEYS } from "../constants";

const isKnownKey = (k: string): k is DocumentKey =>
  (DOCUMENT_KEYS as readonly string[]).includes(k);

export function scoreDocuments(
  profile: EntityProfile,
  grant: Grant,
): DimensionScore & { missing: string[] } {
  const max = WEIGHTS.documents;
  const required = (grant.requiredDocuments ?? []).filter(isKnownKey);
  if (required.length === 0) {
    return { value: NEUTRAL.documents, max, note: "il bando non specifica documenti", missing: [] };
  }
  const missing = required.filter((k) => !profile.documents[k]);
  const possessed = required.length - missing.length;
  const value = Math.round((possessed / required.length) * max);
  const note = missing.length ? `mancano: ${missing.join(", ")}` : "documenti completi";
  return { value, max, note, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/documents.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/documents.ts src/lib/matching/__tests__/documents.test.ts
git commit -m "feat(matching): structured documents checklist dimension (12pt)"
```

---

### Task 7: Track record dimension (6 pt)

**Files:**
- Create: `app/src/lib/matching/dimensions/track-record.ts`
- Test: `app/src/lib/matching/__tests__/track-record.test.ts`

**Interfaces:**
- Consumes: `ProjectHistoryRow`, `EntityProfile`, `Grant`, `DimensionScore`, `ProviderKind`; `WEIGHTS`.
- Produces: `scoreTrackRecord(profile, grant): DimensionScore`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/track-record.test.ts`
Expected: FAIL — `scoreTrackRecord` not defined.

- [ ] **Step 3: Write minimal implementation** — `dimensions/track-record.ts`

```ts
import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS } from "../constants";

function baseFor(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 2;
  if (count <= 5) return 4;
  return 5;
}

export function scoreTrackRecord(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.trackRecord;
  const fundedCount = (profile.projectHistory ?? []).filter((r) => r.outcome === "finanziato").length;
  let value = baseFor(fundedCount);
  const sameKind =
    grant.providerKind != null && (profile.fundingTypesReceived ?? []).includes(grant.providerKind);
  if (sameKind) value = Math.min(max, value + 1);
  const note = fundedCount
    ? `${fundedCount} progetto/i finanziato/i${sameKind ? ", stesso tipo di fondo" : ""}`
    : "nessun progetto finanziato in storico";
  return { value, max, note };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/track-record.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/dimensions/track-record.ts src/lib/matching/__tests__/track-record.test.ts
git commit -m "feat(matching): track-record dimension (6pt)"
```

---

### Task 8: Bonuses / maluses

**Files:**
- Create: `app/src/lib/matching/bonuses.ts`
- Test: `app/src/lib/matching/__tests__/bonuses.test.ts`

**Interfaces:**
- Consumes: `EntityProfile`, `Grant`, `BonusItem`.
- Produces: `computeBonuses(profile, grant): BonusItem[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeBonuses } from "../bonuses";
import type { EntityProfile, Grant } from "../types";

const p = (o: Partial<EntityProfile> = {}) =>
  ({ publicPartners: false, privatePartners: false, cofundingCapacity: null, ...o } as EntityProfile);
const g = (o: Partial<Grant> = {}) =>
  ({ complexity: "media", cofundingRequired: null, ...o } as Grant);

describe("computeBonuses", () => {
  it("partner +5 when entity has partners and grant complexity is alta", () => {
    const b = computeBonuses(p({ publicPartners: true }), g({ complexity: "alta" }));
    expect(b.find((x) => x.key === "partner")?.value).toBe(5);
  });
  it("no partner bonus when complexity is not alta", () => {
    const b = computeBonuses(p({ publicPartners: true }), g({ complexity: "media" }));
    expect(b.find((x) => x.key === "partner")).toBeUndefined();
  });
  it("cofunding manageable +3", () => {
    const b = computeBonuses(p({ cofundingCapacity: 30 }), g({ cofundingRequired: 20 }));
    expect(b.find((x) => x.key === "cofunding")?.value).toBe(3);
  });
  it("cofunding unsustainable -5 when required > 20 and above capacity", () => {
    const b = computeBonuses(p({ cofundingCapacity: 10 }), g({ cofundingRequired: 30 }));
    expect(b.find((x) => x.key === "cofunding")?.value).toBe(-5);
  });
  it("no cofunding item when grant has no cofunding requirement", () => {
    expect(computeBonuses(p(), g({ cofundingRequired: null })).find((x) => x.key === "cofunding")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/bonuses.test.ts`
Expected: FAIL — `computeBonuses` not defined.

- [ ] **Step 3: Write minimal implementation** — `bonuses.ts`

```ts
import type { EntityProfile, Grant, BonusItem } from "./types";

export function computeBonuses(profile: EntityProfile, grant: Grant): BonusItem[] {
  const items: BonusItem[] = [];
  const hasPartners = Boolean(profile.publicPartners || profile.privatePartners);

  // Partner bonus: proxy — high-complexity grants are the partnership-driven ones.
  if (hasPartners && grant.complexity === "alta") {
    items.push({ key: "partner", label: "Partnership utili per un bando complesso", value: 5 });
  }

  // Cofunding: manageable (+3) vs unsustainable (-5).
  const required = grant.cofundingRequired;
  const capacity = profile.cofundingCapacity;
  if (required != null && capacity != null) {
    if (capacity >= required) {
      items.push({ key: "cofunding", label: "Cofinanziamento gestibile", value: 3 });
    } else if (required > 20) {
      items.push({ key: "cofunding", label: "Cofinanziamento insostenibile", value: -5 });
    }
  }
  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/bonuses.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/bonuses.ts src/lib/matching/__tests__/bonuses.test.ts
git commit -m "feat(matching): partner and cofunding bonuses/maluses"
```

---

### Task 9: Indicators (deadline + cofunding) + helpers shrink

**Files:**
- Create: `app/src/lib/matching/indicators.ts`
- Rewrite: `app/src/lib/matching/helpers.ts` (keep only `deadlineDays`, `isClosedGrant`)
- Delete: `app/src/lib/matching/document-profile.ts`
- Test: `app/src/lib/matching/__tests__/indicators.test.ts`

**Interfaces:**
- Consumes: `Grant`, `EntityProfile`, `Indicators`, `DeadlineIndicator`, `CofundingIndicator`.
- Produces: `deadlineDays(deadline: string | null): number | null`; `isClosedGrant(grant: Grant): boolean`; `buildIndicators(profile, grant): Indicators`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildIndicators } from "../indicators";
import { isClosedGrant, deadlineDays } from "../helpers";
import type { EntityProfile, Grant } from "../types";

function grantInDays(days: number, o: Partial<Grant> = {}): Grant {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { status: "aperto", deadline: d.toISOString().split("T")[0], cofundingRequired: null, ...o } as Grant;
}
const p = (o: Partial<EntityProfile> = {}) => ({ cofundingCapacity: null, ...o } as EntityProfile);

describe("helpers", () => {
  it("isClosedGrant: chiuso status", () => {
    expect(isClosedGrant({ status: "chiuso", deadline: null } as Grant)).toBe(true);
  });
  it("isClosedGrant: past deadline", () => {
    expect(isClosedGrant(grantInDays(-3))).toBe(true);
  });
  it("deadlineDays: null when no deadline", () => {
    expect(deadlineDays(null)).toBeNull();
  });
});

describe("deadline indicator", () => {
  it("closed → nero", () => { expect(buildIndicators(p(), grantInDays(-1)).deadline.color).toBe("nero"); });
  it("< 7 days → rosso", () => { expect(buildIndicators(p(), grantInDays(3)).deadline.color).toBe("rosso"); });
  it("7..14 → giallo", () => { expect(buildIndicators(p(), grantInDays(10)).deadline.color).toBe("giallo"); });
  it(">= 15 → verde", () => { expect(buildIndicators(p(), grantInDays(40)).deadline.color).toBe("verde"); });
});

describe("cofunding indicator", () => {
  it("no requirement → grigio", () => {
    expect(buildIndicators(p(), grantInDays(40)).cofunding.color).toBe("grigio");
  });
  it("capacity covers requirement → verde", () => {
    expect(buildIndicators(p({ cofundingCapacity: 30 }), grantInDays(40, { cofundingRequired: 20 })).cofunding.color).toBe("verde");
  });
  it("requirement above capacity and > 20 → rosso", () => {
    expect(buildIndicators(p({ cofundingCapacity: 5 }), grantInDays(40, { cofundingRequired: 30 })).cofunding.color).toBe("rosso");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/__tests__/indicators.test.ts`
Expected: FAIL — `buildIndicators` not defined (and helpers still export old surface).

- [ ] **Step 3a: Rewrite `helpers.ts`**

```ts
import type { Grant } from "./types";

export function deadlineDays(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
}

export function isClosedGrant(grant: Grant): boolean {
  if (grant.status === "chiuso") return true;
  const days = deadlineDays(grant.deadline);
  // <= 0: a deadline that just passed (within ~24h) ceils to -0/0, and a
  // future "closes today" deadline yields 1 (end-of-day anchor), so 0 means closed.
  return days != null && days <= 0;
}
```

- [ ] **Step 3b: Write `indicators.ts`**

```ts
import type {
  EntityProfile, Grant, Indicators, DeadlineIndicator, CofundingIndicator, DeadlineColor,
} from "./types";
import { deadlineDays, isClosedGrant } from "./helpers";

function deadlineIndicator(grant: Grant): DeadlineIndicator {
  if (isClosedGrant(grant)) return { days: deadlineDays(grant.deadline), color: "nero", label: "bando chiuso" };
  const days = deadlineDays(grant.deadline);
  let color: DeadlineColor = "verde";
  if (days == null) color = "verde";
  else if (days < 7) color = "rosso";
  else if (days < 15) color = "giallo";
  const label = days == null ? "senza scadenza" : `scade tra ${days} giorni`;
  return { days, color, label };
}

function cofundingIndicator(profile: EntityProfile, grant: Grant): CofundingIndicator {
  const required = grant.cofundingRequired;
  if (required == null) return { required: null, color: "grigio", label: "cofinanziamento non specificato" };
  const capacity = profile.cofundingCapacity;
  let color: CofundingIndicator["color"] = "giallo";
  if (capacity != null && capacity >= required) color = "verde";
  else if (required > 20) color = "rosso";
  return { required, color, label: `cofinanziamento richiesto ${required}%` };
}

export function buildIndicators(profile: EntityProfile, grant: Grant): Indicators {
  return { deadline: deadlineIndicator(grant), cofunding: cofundingIndicator(profile, grant) };
}
```

- [ ] **Step 3c: Delete the obsolete file**

```bash
git rm src/lib/matching/document-profile.ts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/__tests__/indicators.test.ts`
Expected: PASS (10 tests). (The full suite still fails to typecheck because `calculate-match.ts`, `breakdown.ts`, `actions.ts`, `verdict.ts`, `index.ts` reference the old surface — fixed in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/indicators.ts src/lib/matching/helpers.ts src/lib/matching/__tests__/indicators.test.ts
git commit -m "feat(matching): deadline+cofunding indicators; shrink helpers; drop document-profile"
```

---

### Task 10: Orchestration — calculate-match, breakdown, actions, verdict, index

**Files:**
- Rewrite: `app/src/lib/matching/calculate-match.ts`
- Rewrite: `app/src/lib/matching/breakdown.ts`
- Rewrite: `app/src/lib/matching/actions.ts`
- Rewrite: `app/src/lib/matching/verdict.ts`
- Rewrite: `app/src/lib/matching/index.ts`
- Rewrite: `app/src/lib/matching/__tests__/calculate-match.test.ts`
- Create: `app/src/lib/matching/__tests__/verdict.test.ts`

**Interfaces:**
- Consumes: every dimension fn (Tasks 2–7), `computeBonuses` (8), `buildIndicators` (9), all types/constants (1).
- Produces: `calculateMatch(profile: EntityProfile, grant: Grant): MatchResult`; `computeVerdict(baseScoreOrResult): Verdict` via `deriveVerdict(score, missingDocs, isClosed)`; `buildBreakdown(dims): BreakdownItem[]`; `buildActions(...): string[]`.

- [ ] **Step 1: Write `verdict.ts`**

```ts
import type { Verdict } from "./types";
import { VERDICT_THRESHOLDS } from "./constants";

export function deriveVerdict(
  score: number,
  hasAllDocuments: boolean,
  isClosed: boolean,
): Verdict {
  if (isClosed) return "Storico";
  if (score >= VERDICT_THRESHOLDS.candidabile) {
    return hasAllDocuments ? "Candidabile" : "Da preparare";
  }
  if (score >= VERDICT_THRESHOLDS.daValutare) return "Da valutare";
  if (score >= VERDICT_THRESHOLDS.bassaPriorita) return "Bassa priorità";
  return "Non compatibile";
}
```

- [ ] **Step 2: Write `verdict.test.ts` and run it (fails, then passes after step 1 exists)**

```ts
import { describe, it, expect } from "vitest";
import { deriveVerdict } from "../verdict";

describe("deriveVerdict", () => {
  it("closed grant → Storico even at score 100", () => {
    expect(deriveVerdict(100, true, true)).toBe("Storico");
  });
  it(">=75 with all docs → Candidabile", () => { expect(deriveVerdict(80, true, false)).toBe("Candidabile"); });
  it(">=75 missing docs → Da preparare", () => { expect(deriveVerdict(80, false, false)).toBe("Da preparare"); });
  it(">=50 → Da valutare", () => { expect(deriveVerdict(60, true, false)).toBe("Da valutare"); });
  it(">=30 → Bassa priorità", () => { expect(deriveVerdict(40, true, false)).toBe("Bassa priorità"); });
  it("<30 → Non compatibile", () => { expect(deriveVerdict(10, true, false)).toBe("Non compatibile"); });
});
```

Run: `npx vitest run src/lib/matching/__tests__/verdict.test.ts` → expect PASS (6 tests).

- [ ] **Step 3: Write `breakdown.ts`**

```ts
import type { DimensionScore, BreakdownItem, DimensionKey } from "./types";

const LABELS: Record<DimensionKey, string> = {
  themes: "Temi", legalForm: "Forma giuridica", territory: "Territorio",
  capacity: "Capacità", documents: "Documenti", trackRecord: "Track record",
};

export function buildBreakdown(dims: Record<DimensionKey, DimensionScore>): BreakdownItem[] {
  return (Object.keys(LABELS) as DimensionKey[]).map((key) => ({
    key, label: LABELS[key], value: dims[key].value, max: dims[key].max, note: dims[key].note,
  }));
}
```

- [ ] **Step 4: Write `actions.ts`**

```ts
import type { EntityProfile, Grant, BreakdownItem } from "./types";
import { isClosedGrant } from "./helpers";

export function buildActions(
  grant: Grant,
  breakdown: BreakdownItem[],
  missingDocuments: string[],
): string[] {
  const actions: string[] = [];
  if (missingDocuments.length) {
    actions.push(`Per candidarti ti manca: ${missingDocuments.join(", ")}.`);
  }
  const territory = breakdown.find((b) => b.key === "territory");
  if (territory && territory.value === 0) {
    actions.push("Verifica se il bando ammette enti fuori dal suo ambito territoriale.");
  }
  const capacity = breakdown.find((b) => b.key === "capacity");
  if (capacity && capacity.value <= 2) {
    actions.push("Il bando è complesso per la tua capacità gestionale: valuta un partner capofila.");
  }
  if (isClosedGrant(grant)) {
    actions.push("Bando chiuso: usalo come riferimento storico, non è candidabile.");
  }
  return actions.slice(0, 4);
}
```

- [ ] **Step 5: Write `calculate-match.ts`**

```ts
import type { EntityProfile, Grant, MatchResult, DimensionScore, DimensionKey } from "./types";
import { scoreThemes } from "./dimensions/themes";
import { scoreLegalForm } from "./dimensions/legal-form";
import { scoreTerritory } from "./dimensions/territory";
import { scoreCapacity } from "./dimensions/capacity";
import { scoreDocuments } from "./dimensions/documents";
import { scoreTrackRecord } from "./dimensions/track-record";
import { computeBonuses } from "./bonuses";
import { buildIndicators } from "./indicators";
import { buildBreakdown } from "./breakdown";
import { buildActions } from "./actions";
import { deriveVerdict } from "./verdict";
import { isClosedGrant } from "./helpers";

export function calculateMatch(profile: EntityProfile, grant: Grant): MatchResult {
  const documents = scoreDocuments(profile, grant);
  const dims: Record<DimensionKey, DimensionScore> = {
    themes: scoreThemes(profile, grant),
    legalForm: scoreLegalForm(profile, grant),
    territory: scoreTerritory(profile, grant),
    capacity: scoreCapacity(profile, grant),
    documents: { value: documents.value, max: documents.max, note: documents.note },
    trackRecord: scoreTrackRecord(profile, grant),
  };

  const baseScore = (Object.keys(dims) as DimensionKey[]).reduce((s, k) => s + dims[k].value, 0);
  const bonuses = computeBonuses(profile, grant);
  const bonusTotal = bonuses.reduce((s, b) => s + b.value, 0);
  const score = Math.max(0, Math.min(100, baseScore + bonusTotal));

  const breakdown = buildBreakdown(dims);
  const closed = isClosedGrant(grant);
  const verdict = deriveVerdict(score, documents.missing.length === 0, closed);
  const actions = buildActions(grant, breakdown, documents.missing);

  return {
    score,
    baseScore,
    verdict,
    breakdown,
    bonuses,
    indicators: buildIndicators(profile, grant),
    missingDocuments: documents.missing,
    actions,
  };
}
```

- [ ] **Step 6: Rewrite `index.ts`**

```ts
export { calculateMatch } from "./calculate-match";
export { deriveVerdict } from "./verdict";
export { buildBreakdown } from "./breakdown";
export { buildActions } from "./actions";
export { buildIndicators } from "./indicators";
export { computeBonuses } from "./bonuses";
export { scoreThemes } from "./dimensions/themes";
export { scoreLegalForm } from "./dimensions/legal-form";
export { scoreTerritory } from "./dimensions/territory";
export { calculateCapacity, scoreCapacity } from "./dimensions/capacity";
export { scoreDocuments } from "./dimensions/documents";
export { scoreTrackRecord } from "./dimensions/track-record";
export { deadlineDays, isClosedGrant } from "./helpers";
export {
  LEGAL_TYPES, TAGS, LEGAL_TYPE_GROUPS, TAG_MACRO_AREAS, PROVINCES, PROVINCE_TO_REGION,
  WEIGHTS, CAPACITY_MATRIX, DOCUMENT_KEYS, VERDICT_THRESHOLDS, NEUTRAL,
  regionForProvince, groupForLegalType,
} from "./constants";
export type {
  GeoScope, ComplexityLevel, CapacityLevel, ProviderKind, GrantStatus, ProjectOutcome,
  Verdict, CapacityAnswers, EntityDocuments, ProjectHistoryRow, EntityProfile, Grant,
  DimensionScore, DimensionKey, BreakdownItem, BonusItem, Indicators, MatchResult,
} from "./types";
```

- [ ] **Step 7: Rewrite `__tests__/calculate-match.test.ts`**

Replace the whole file. Include `makeProfile`/`makeGrant` builders in the v2 shape, a perfect-match → 100 case, a low-match case, the closed→Storico case, and the two invariants:

```ts
import { describe, it, expect } from "vitest";
import { calculateMatch } from "../index";
import type { EntityProfile, Grant, CapacityAnswers } from "../types";

const maxAnswers: CapacityAnswers = {
  stableStaff: "30+", dedicatedAdmin: true, fundedProjects3y: "5+",
  reportingExperience: "regolarmente", annualBudget: ">500k", euProject: true,
};

function makeProfile(o: Partial<EntityProfile> = {}): EntityProfile {
  return {
    legalType: "ASD - Associazione Sportiva Dilettantistica",
    province: "RN", region: "Emilia-Romagna", operatingProvinces: [],
    themes: ["sport", "giovani", "inclusione"],
    capacity: maxAnswers,
    documents: { statuto: true, bilancio: true, runts: true, rasd: true, durc: true, certificazioni: true },
    publicPartners: true, privatePartners: false,
    projectHistory: [
      { grantName: "x", providerId: null, year: 2023, outcome: "finanziato", amount: 1000, kind: "pubblico" },
      { grantName: "y", providerId: null, year: 2022, outcome: "finanziato", amount: 1000, kind: "pubblico" },
      { grantName: "z", providerId: null, year: 2021, outcome: "finanziato", amount: 1000, kind: "pubblico" },
    ],
    fundingTypesReceived: ["pubblico"], cofundingCapacity: 50,
    ...o,
  };
}
function makeGrant(o: Partial<Grant> = {}): Grant {
  const d = new Date(); d.setDate(d.getDate() + 40);
  return {
    id: "g", title: "Sport inclusivo", providerId: null, providerKind: "pubblico",
    deadline: d.toISOString().split("T")[0], status: "aperto", amount: 20000, cofundingRequired: 10,
    eligibleTypes: ["ASD - Associazione Sportiva Dilettantistica"],
    tags: ["sport", "giovani", "inclusione"], area: "Emilia-Romagna", geoScope: "regionale",
    complexity: "media", requiredDocuments: ["statuto", "bilancio"],
    summary: "", requirements: "", url: "https://x", beneficiaries: "",
    ...o,
  };
}

describe("calculateMatch", () => {
  it("perfect profile → 100", () => {
    expect(calculateMatch(makeProfile(), makeGrant()).score).toBe(100);
  });
  it("breakdown always has 6 items summing max to 100", () => {
    const r = calculateMatch(makeProfile(), makeGrant());
    expect(r.breakdown).toHaveLength(6);
    expect(r.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
  });
  it("I2: baseScore equals sum of breakdown values; final score in [0,100]", () => {
    const r = calculateMatch(makeProfile({ publicPartners: false }), makeGrant());
    expect(r.baseScore).toBe(r.breakdown.reduce((s, b) => s + b.value, 0));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("I8: empty grant data yields documented neutrals, not zero", () => {
    const r = calculateMatch(makeProfile({ capacity: null }), makeGrant({
      tags: [], eligibleTypes: [], geoScope: null, area: null, complexity: null, requiredDocuments: [],
    }));
    const by = Object.fromEntries(r.breakdown.map((b) => [b.key, b.value]));
    expect(by.themes).toBe(19);
    expect(by.territory).toBe(12);
    expect(by.capacity).toBe(9);
    expect(by.documents).toBe(8);
    expect(by.legalForm).toBe(22); // open to all
  });
  it("low match: wrong type, region, themes → Non compatibile or Bassa priorità", () => {
    const r = calculateMatch(
      makeProfile({ legalType: "Comune", province: "PA", region: "Sicilia", themes: ["cultura"],
        capacity: null, documents: { statuto: false, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false },
        publicPartners: false, projectHistory: [], fundingTypesReceived: [], cofundingCapacity: 0 }),
      makeGrant({ complexity: "alta" }),
    );
    expect(["Non compatibile", "Bassa priorità"]).toContain(r.verdict);
  });
  it("closed grant → Storico", () => {
    expect(calculateMatch(makeProfile(), makeGrant({ status: "chiuso" })).verdict).toBe("Storico");
  });
  it("missing required docs downgrades Candidabile to Da preparare", () => {
    const r = calculateMatch(
      makeProfile({ documents: { statuto: true, bilancio: false, runts: false, rasd: false, durc: false, certificazioni: false } }),
      makeGrant({ requiredDocuments: ["statuto", "bilancio"] }),
    );
    if (r.score >= 75) {
      expect(r.verdict).toBe("Da preparare");
      expect(r.missingDocuments).toContain("bilancio");
    }
  });
});
```

- [ ] **Step 8: Run the FULL suite + typecheck**

Run: `npx vitest run` → expect ALL tests green (constants, themes, legal-form, territory, capacity, documents, track-record, bonuses, indicators, verdict, calculate-match).
Run: `npx tsc --noEmit` → expect exit 0.
If the perfect-match case is not exactly 100, compute by hand: themes 28 + legalForm 22 + territory 18 + capacity(Alta×media=14) + documents(2/2=12) + trackRecord(3 funded=4, +1 same kind=5) = 99, then partner bonus needs complexity alta to fire (it won't at "media"), cofunding manageable +3 → clamp(99+3)=100. Verify the builders produce this; adjust the builder (e.g. `fundedProjects` count) so the documented arithmetic holds, not the assertion.

- [ ] **Step 9: Commit**

```bash
git add src/lib/matching
git commit -m "feat(matching): orchestration, breakdown, actions, verdict v2 + rewritten tests"
```

---

### Task 11: ADRs + branch verification

**Files:**
- Create: `docs/adr/0003-rule-based-matching.md`
- Create: `docs/adr/0004-calculated-capacity.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write `docs/adr/0003-rule-based-matching.md`**

Copy ADR-003 text from the roadmap (context → decision → why): matching is purely rule-based, on-the-fly, deterministic; AI only on-demand and at ingestion. Status: accepted.

- [ ] **Step 2: Write `docs/adr/0004-calculated-capacity.md`**

Copy ADR-004: capacity computed from 6 questions, never a self-declared dropdown; `calculateCapacity()` deterministic and tested; document the exact point system and thresholds used (decision #2 above). Status: accepted.

- [ ] **Step 3: Verification (verification-before-completion)**

Run and paste the output into the PR/summary:
```bash
npx vitest run
npx tsc --noEmit
grep -rEn "textOverlap|legalTypeKey|minCapacity|documentFiles|document-profile|clientDocumentProfile" src/lib/matching || echo "NO RESIDUAL v1 REFERENCES"
```
Expected: all tests green; tsc exit 0; the grep prints `NO RESIDUAL v1 REFERENCES`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0003-rule-based-matching.md docs/adr/0004-calculated-capacity.md
git commit -m "docs(adr): rule-based matching and calculated capacity"
```

---

## Self-Review

**Spec coverage** (roadmap b002 + design §2):
- 6 dimensions 28/22/18/14/12/6 → Tasks 2–7; sum=100 enforced in Task 1 + Task 10. ✓
- Legal form 8 groups → Task 1 (`LEGAL_TYPE_GROUPS`, `LEGAL_TYPE_TO_GROUP`) + Task 3. ✓
- Structured territory, no `textOverlap` → Task 4; `textOverlap` removed in Task 9. ✓
- Calculated capacity + 3×3 matrix → Task 5; ADR-004 → Task 11. ✓
- Structured documents checklist + `missingDocuments` → Task 6; `document-profile.ts` deleted Task 9. ✓
- Track record 0/2/4/5 +1 → Task 7. ✓
- Bonuses partner +5 / cofunding +3 / −5 → Task 8. ✓
- Indicators deadline + cofunding (economic coherence deferred to 014) → Task 9. ✓
- Verdicts §2.9 (6 values incl. "Non compatibile", "Da valutare") → Task 10 (`deriveVerdict`) + `verdict.test.ts`. ✓
- Invariants I2 & I8 as property/case tests → Task 10 calculate-match.test.ts. ✓
- helpers reduced to `deadlineDays`/`isClosedGrant`; barrel updated → Tasks 9–10. ✓
- Every scoring-table cell has an exact-value test → Tasks 2–7 + Task 10 I8 case. ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code. ✓

**Type consistency:** `DimensionScore {value,max,note}` used by all `score*` fns; `scoreDocuments` additionally returns `missing`; `deriveVerdict(score, hasAllDocuments, isClosed)` signature matches its caller in `calculate-match.ts`; enum values lowercase throughout (`"alta"`, `"regionale"`, `"pubblico"`). ✓

## Execution Handoff

Plan complete. Two execution options:
1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks.
2. **Inline Execution** — tasks in this session with checkpoints.
