# Scraper V2 Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the scraper pipeline to fetch grant detail pages, add new DB fields, fix dedup/status logic, add scrape logging, and split the cron into two phases with throttling.

**Architecture:** Two-phase pipeline (listing → detail enrichment) with per-grant throttling, `pg_cron` auto-expiration, partial UNIQUE constraint for edition dedup, and a `scrape_logs` table for observability. The scraper remains a separate bounded context from the app; shared types are duplicated, not imported.

**Tech Stack:** TypeScript (scraper package), Postgres migrations (Supabase), Vitest tests, Vercel cron

## Global Constraints

- Scraper MUST NOT import from `app/` — duplicate shared types when needed
- All DB enums are lowercase, aligned with the matching module
- JSON schemas MUST use `nullable: true` (never `type: ["string","null"]`) for Gemini compatibility
- Throttle ≥ 6s between Gemini calls
- Tests use `FakeLLMProvider`, `InMemoryGrantsDb`, `FixtureFetcher` — no real API calls
- Language: code/comments in English, UI strings in Italian
- Branch: `claude/bandi-scanner-v2-recap-cqqh4s`

---

### Task 1: DB Migration — New enum values, new columns, new table, constraint change

**Files:**
- Create: `app/supabase/migrations/0008_scraper_v2.sql`

**Interfaces:**
- Produces: new `grant_status` value `scaduto`, new `funding_type` enum, new columns on `grants`, new `scrape_logs` table, partial unique constraint

- [ ] **Step 1: Write migration 0008_scraper_v2.sql**

```sql
-- 0008_scraper_v2.sql — Scraper V2: new fields, status enum, funding_type enum,
-- scrape_logs table, partial unique constraint, auto-expiration function.

-- 1. Add 'scaduto' to grant_status enum
ALTER TYPE grant_status ADD VALUE IF NOT EXISTS 'scaduto';

-- 2. Create funding_type enum
CREATE TYPE funding_type AS ENUM (
  'fondo_perduto', 'prestito_agevolato', 'contributo_misto', 'garanzia', 'premio'
);

-- 3. Add new columns to grants
ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS funding_type funding_type,
  ADD COLUMN IF NOT EXISTS min_amount numeric,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS cofunding_percentage numeric,
  ADD COLUMN IF NOT EXISTS eligible_expenses text,
  ADD COLUMN IF NOT EXISTS application_method text,
  ADD COLUMN IF NOT EXISTS contact_info text,
  ADD COLUMN IF NOT EXISTS detail_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS detail_fetch_attempts int NOT NULL DEFAULT 0;

-- 4. Drop the old UNIQUE(url) and create partial unique
ALTER TABLE public.grants DROP CONSTRAINT IF EXISTS grants_url_key;
CREATE UNIQUE INDEX grants_url_active_unique ON public.grants (url) WHERE status != 'scaduto';

-- 5. Create scrape_logs table
CREATE TABLE public.scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.grant_sources(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  phase text NOT NULL DEFAULT 'listing',  -- 'listing' or 'detail'
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  errors text[] NOT NULL DEFAULT '{}',
  detail_errors text[] NOT NULL DEFAULT '{}',
  duration_ms int
);
CREATE INDEX ON public.scrape_logs (source_id, ran_at DESC);

-- 6. Auto-expiration function (called by pg_cron nightly)
CREATE OR REPLACE FUNCTION public.expire_grants() RETURNS void
  LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.grants
     SET status = 'scaduto'
   WHERE deadline < CURRENT_DATE
     AND status = 'aperto';
$$;

-- 7. Disable all sources except one for gradual rollout
UPDATE public.grant_sources SET enabled = false;
UPDATE public.grant_sources SET enabled = true
 WHERE name = 'Fondazione Cariplo - Bandi';
```

- [ ] **Step 2: Apply migration to Supabase**

Run via the Supabase MCP `apply_migration` tool with name `scraper_v2` and the SQL above.

- [ ] **Step 3: Schedule pg_cron for auto-expiration**

Run via Supabase MCP `execute_sql`:
```sql
SELECT cron.schedule(
  'expire-grants-nightly',
  '0 2 * * *',
  $$SELECT public.expire_grants()$$
);
```

- [ ] **Step 4: Commit**

```bash
git add app/supabase/migrations/0008_scraper_v2.sql
git commit -m "feat(db): migration 0008 — scraper v2 schema changes

Add 'scaduto' to grant_status, funding_type enum, 7 new grant columns,
detail_fetched_at/detail_fetch_attempts tracking, scrape_logs table,
partial unique index on url (excludes scaduto), expire_grants() function,
and disable all sources except Fondazione Cariplo for gradual rollout."
```

---

### Task 2: Scraper — Update vocab, types, and ExtractedGrant

**Files:**
- Modify: `scraper/src/pipeline/vocab.ts`
- Modify: `scraper/src/pipeline/types.ts`
- Modify: `scraper/src/pipeline/enrich.ts`
- Test: `scraper/tests/enrich.test.ts`

**Interfaces:**
- Produces: `GrantStatus` now includes `"scaduto"`, `FundingType` type, `ExtractedGrant` with 8 new fields + `sourceId`, `DetailGrant` type for detail extraction output

- [ ] **Step 1: Update vocab.ts — add "scaduto" to GRANT_STATUS, add FUNDING_TYPES**

In `scraper/src/pipeline/vocab.ts`, change:
```typescript
export const GRANT_STATUS = ["aperto", "chiuso", "scaduto"] as const;

export const FUNDING_TYPES = [
  "fondo_perduto", "prestito_agevolato", "contributo_misto", "garanzia", "premio",
] as const;
export const FUNDING_TYPE_SET = new Set<string>(FUNDING_TYPES);
export type FundingType = (typeof FUNDING_TYPES)[number];
```

- [ ] **Step 2: Update ExtractedGrant in types.ts — add new fields + sourceId**

In `scraper/src/pipeline/types.ts`:
```typescript
import type { GeoScope, Complexity, GrantStatus, FundingType } from "./vocab";

export interface ExtractedGrant {
  title: string;
  url: string;
  sourceId: string;
  providerId: string | null;
  deadline: string | null;
  status: GrantStatus | null;
  amount: number | null;
  cofundingRequired: number | null;
  cofundingPercentage: number | null;
  eligibleTypes: string[];
  tags: string[];
  area: string | null;
  geoScope: GeoScope | null;
  complexity: Complexity | null;
  requiredDocuments: string[];
  summary: string | null;
  requirements: string | null;
  beneficiaries: string | null;
  openingDate: string | null;
  fundingType: FundingType | null;
  minAmount: number | null;
  maxAmount: number | null;
  eligibleExpenses: string | null;
  applicationMethod: string | null;
  contactInfo: string | null;
}

export interface DetailGrant {
  summary: string | null;
  requirements: string | null;
  beneficiaries: string | null;
  amount: number | null;
  cofundingRequired: number | null;
  cofundingPercentage: number | null;
  eligibleTypes: string[];
  tags: string[];
  complexity: Complexity | null;
  requiredDocuments: string[];
  openingDate: string | null;
  fundingType: FundingType | null;
  minAmount: number | null;
  maxAmount: number | null;
  eligibleExpenses: string | null;
  applicationMethod: string | null;
  contactInfo: string | null;
}
```

Also add `sourceId` to `PipelineResult`:
```typescript
export interface PipelineResult {
  sourceId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  detailErrors: string[];
}
```

- [ ] **Step 3: Update enrich.ts — handle new fields passthrough**

The `enrich` function should pass through the new fields unchanged (they come from the detail extraction, not from inference). No new inference logic needed for the new fields.

- [ ] **Step 4: Run tests to verify nothing breaks**

```bash
cd scraper && npx vitest run
```

Expected: existing tests fail because `ExtractedGrant` now requires `sourceId` and new fields. Fix the test helpers next.

- [ ] **Step 5: Update test helpers — InMemoryGrantsDb and fixture factories**

In `scraper/tests/helpers/memory-db.ts`, no changes needed (it accepts `ExtractedGrant` generically).

In `scraper/tests/dedup.test.ts` and other tests, update the `g()` factory:
```typescript
function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", sourceId: "s1", providerId: null,
    deadline: null, status: "aperto", amount: null, cofundingRequired: null,
    cofundingPercentage: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null, openingDate: null,
    fundingType: null, minAmount: null, maxAmount: null,
    eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd scraper && npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add scraper/src/pipeline/vocab.ts scraper/src/pipeline/types.ts scraper/src/pipeline/enrich.ts scraper/tests/
git commit -m "feat(scraper): update types for v2 — new fields, sourceId, DetailGrant"
```

---

### Task 3: Scraper — Detail extraction (extract-detail.ts)

**Files:**
- Create: `scraper/src/pipeline/extract-detail.ts`
- Test: `scraper/tests/extract-detail.test.ts`

**Interfaces:**
- Consumes: `LLMProvider.extract()`, `DetailGrant` from types
- Produces: `extractDetail(html: string, deps: { llm: LLMProvider }): Promise<DetailGrant | null>`

- [ ] **Step 1: Write the failing test**

Create `scraper/tests/extract-detail.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { extractDetail, DETAIL_JSON_SCHEMA } from "../src/pipeline/extract-detail";
import { FakeLLMProvider } from "../src/providers/fake";

function llmReturning(value: unknown, html = "DETAIL_HTML") {
  return new FakeLLMProvider(new Map<string, unknown>([[html, value]]));
}

describe("extractDetail", () => {
  it("extracts detail fields from a valid response", async () => {
    const llm = llmReturning({
      summary: "Bando per lo sport",
      requirements: "Essere ASD",
      beneficiaries: "Associazioni sportive",
      amount: "€ 50.000,00",
      cofunding_percentage: 20,
      eligible_types: ["ASD - Associazione Sportiva Dilettantistica"],
      tags: ["sport"],
      complexity: "media",
      required_documents: ["statuto", "bilancio"],
      opening_date: "2026-01-15",
      funding_type: "fondo_perduto",
      min_amount: "€ 5.000",
      max_amount: "€ 50.000",
      eligible_expenses: "Personale, attrezzature",
      application_method: "Piattaforma online ROL",
      contact_info: "info@fondazione.it",
    });
    const result = await extractDetail("DETAIL_HTML", { llm });
    expect(result).not.toBeNull();
    expect(result!.summary).toBe("Bando per lo sport");
    expect(result!.amount).toBe(50000);
    expect(result!.cofundingPercentage).toBe(20);
    expect(result!.fundingType).toBe("fondo_perduto");
    expect(result!.minAmount).toBe(5000);
    expect(result!.maxAmount).toBe(50000);
    expect(result!.openingDate).toBe("2026-01-15");
    expect(result!.tags).toEqual(["sport"]);
    expect(result!.eligibleTypes).toEqual(["ASD - Associazione Sportiva Dilettantistica"]);
    expect(result!.requiredDocuments).toEqual(["statuto", "bilancio"]);
  });

  it("returns null on provider error", async () => {
    const throwing = new FakeLLMProvider(new Map(), "throw");
    expect(await extractDetail("DETAIL_HTML", { llm: throwing })).toBeNull();
  });

  it("returns null on non-object response", async () => {
    for (const value of [null, "not-json", 42, [1, 2]]) {
      expect(await extractDetail("DETAIL_HTML", { llm: llmReturning(value) })).toBeNull();
    }
  });

  it("drops invalid tags and eligibleTypes", async () => {
    const llm = llmReturning({
      tags: ["sport", "inventato"],
      eligible_types: ["ONLUS", "TipoFinto"],
    });
    const result = await extractDetail("DETAIL_HTML", { llm });
    expect(result!.tags).toEqual(["sport"]);
    expect(result!.eligibleTypes).toEqual(["ONLUS"]);
  });

  it("nulls non-ISO dates in opening_date", async () => {
    const llm = llmReturning({ opening_date: "15 gennaio 2026" });
    const result = await extractDetail("DETAIL_HTML", { llm });
    expect(result!.openingDate).toBeNull();
  });

  it("drops invalid funding_type", async () => {
    const llm = llmReturning({ funding_type: "inventato" });
    const result = await extractDetail("DETAIL_HTML", { llm });
    expect(result!.fundingType).toBeNull();
  });

  it("DETAIL_JSON_SCHEMA never declares type as an array", () => {
    const offenders: string[] = [];
    function walk(node: unknown, path: string): void {
      if (typeof node !== "object" || node === null) return;
      const obj = node as Record<string, unknown>;
      if ("type" in obj && Array.isArray(obj.type)) offenders.push(path);
      if (obj.items) walk(obj.items, `${path}.items`);
      if (obj.properties && typeof obj.properties === "object") {
        for (const [k, v] of Object.entries(obj.properties as Record<string, unknown>)) {
          walk(v, `${path}.properties.${k}`);
        }
      }
    }
    walk(DETAIL_JSON_SCHEMA, "$");
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scraper && npx vitest run tests/extract-detail.test.ts
```
Expected: FAIL — module `../src/pipeline/extract-detail` does not exist.

- [ ] **Step 3: Write extract-detail.ts**

Create `scraper/src/pipeline/extract-detail.ts`:
```typescript
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { DetailGrant } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, FUNDING_TYPE_SET, COMPLEXITY } from "./vocab";
import type { Complexity, FundingType } from "./vocab";
import { parseItalianAmount } from "./enrich";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DETAIL_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", nullable: true },
    requirements: { type: "string", nullable: true },
    beneficiaries: { type: "string", nullable: true },
    amount: { type: "string", nullable: true },
    cofunding_required: { type: "string", nullable: true },
    cofunding_percentage: { type: "number", nullable: true },
    eligible_types: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    complexity: { type: "string", nullable: true },
    required_documents: { type: "array", items: { type: "string" } },
    opening_date: { type: "string", nullable: true },
    funding_type: { type: "string", nullable: true },
    min_amount: { type: "string", nullable: true },
    max_amount: { type: "string", nullable: true },
    eligible_expenses: { type: "string", nullable: true },
    application_method: { type: "string", nullable: true },
    contact_info: { type: "string", nullable: true },
  },
};

export const DETAIL_INSTRUCTIONS = [
  "Sei un assistente che estrae i dettagli di un singolo bando di finanziamento da una pagina web italiana.",
  "Restituisci un oggetto JSON con i campi dello schema.",
  "Usa null quando un campo non è presente nella pagina.",
  "Le date devono essere in formato ISO (YYYY-MM-DD).",
  "Gli importi devono essere stringhe con il formato originale (es. '€ 50.000,00').",
  "cofunding_percentage è la percentuale di cofinanziamento richiesta (numero, es. 20 per 20%).",
  "Non inventare valori: se non sei sicuro, usa null.",
].join(" ");

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseItalianAmount(v);
  return null;
}

export async function extractDetail(
  html: string,
  deps: { llm: LLMProvider },
): Promise<DetailGrant | null> {
  let raw: unknown;
  try {
    raw = await deps.llm.extract({ html, schema: DETAIL_JSON_SCHEMA, instructions: DETAIL_INSTRUCTIONS });
  } catch {
    return null;
  }
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return null; } }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const o = raw as Record<string, unknown>;

  const complexityRaw = stringOrNull(o.complexity);
  const complexity = complexityRaw && (COMPLEXITY as readonly string[]).includes(complexityRaw)
    ? (complexityRaw as Complexity) : null;

  const fundingRaw = stringOrNull(o.funding_type);
  const fundingType = fundingRaw && FUNDING_TYPE_SET.has(fundingRaw)
    ? (fundingRaw as FundingType) : null;

  const openingRaw = stringOrNull(o.opening_date);
  const openingDate = openingRaw && ISO_DATE.test(openingRaw) ? openingRaw : null;

  return {
    summary: stringOrNull(o.summary),
    requirements: stringOrNull(o.requirements),
    beneficiaries: stringOrNull(o.beneficiaries),
    amount: numOrNull(o.amount),
    cofundingRequired: numOrNull(o.cofunding_required),
    cofundingPercentage: numOrNull(o.cofunding_percentage),
    eligibleTypes: stringArray(o.eligible_types).filter((t) => LEGAL_TYPE_SET.has(t)),
    tags: stringArray(o.tags).filter((t) => TAG_SET.has(t)),
    complexity,
    requiredDocuments: stringArray(o.required_documents).filter((d) => DOCUMENT_KEY_SET.has(d)),
    openingDate,
    fundingType,
    minAmount: numOrNull(o.min_amount),
    maxAmount: numOrNull(o.max_amount),
    eligibleExpenses: stringOrNull(o.eligible_expenses),
    applicationMethod: stringOrNull(o.application_method),
    contactInfo: stringOrNull(o.contact_info),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scraper && npx vitest run tests/extract-detail.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/extract-detail.ts scraper/tests/extract-detail.test.ts
git commit -m "feat(scraper): detail extraction — schema, prompt, and coerce for single-grant pages"
```

---

### Task 4: Scraper — Update dedup for edition awareness and source_id

**Files:**
- Modify: `scraper/src/pipeline/dedup.ts`
- Modify: `scraper/src/pipeline/save.ts`
- Modify: `scraper/tests/dedup.test.ts`

**Interfaces:**
- Consumes: `ExtractedGrant` (with `sourceId`), `StoredGrant`
- Produces: `decide()` now returns `"insert"` for expired+new-deadline grants instead of `"update"`

- [ ] **Step 1: Write failing tests for edition-aware dedup**

Add to `scraper/tests/dedup.test.ts`:
```typescript
it("inserts a new edition when existing is scaduto and deadline differs", () => {
  const incoming = g({ deadline: "2027-06-01" });
  const existing = { ...g({ deadline: "2026-06-01", status: "scaduto" as const }), id: "g1" };
  expect(decide(incoming, existing)).toEqual({ action: "insert" });
});

it("inserts a new edition when existing is chiuso and deadline differs", () => {
  const incoming = g({ deadline: "2027-06-01" });
  const existing = { ...g({ deadline: "2026-06-01", status: "chiuso" as const }), id: "g1" };
  expect(decide(incoming, existing)).toEqual({ action: "insert" });
});

it("skips when existing is scaduto and same deadline (not a new edition)", () => {
  const incoming = g({ deadline: "2026-06-01" });
  const existing = { ...g({ deadline: "2026-06-01", status: "scaduto" as const }), id: "g1" };
  expect(decide(incoming, existing)).toEqual({ action: "skip" });
});

it("skips when existing is scaduto and no new deadline info", () => {
  const incoming = g({ deadline: null });
  const existing = { ...g({ deadline: "2026-06-01", status: "scaduto" as const }), id: "g1" };
  expect(decide(incoming, existing)).toEqual({ action: "skip" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scraper && npx vitest run tests/dedup.test.ts
```
Expected: FAIL — the new tests return `update` or `skip` instead of `insert`.

- [ ] **Step 3: Update decide() in dedup.ts**

```typescript
export function decide(incoming: ExtractedGrant, existing: (ExtractedGrant & { id: string }) | null): Decision {
  if (existing == null) return { action: "insert" };

  const existingClosed = existing.status === "scaduto" || existing.status === "chiuso";
  if (existingClosed) {
    const newDeadline = incoming.deadline;
    const isNewEdition = newDeadline != null && newDeadline !== existing.deadline;
    return isNewEdition ? { action: "insert" } : { action: "skip" };
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
```

- [ ] **Step 4: Update save.ts to pass sourceId through**

In `scraper/src/pipeline/save.ts`, the `toStore` already spreads `grant` which now includes `sourceId`. No changes needed to save.ts logic — `sourceId` flows through to `grantToInsertRow`.

- [ ] **Step 5: Add sourceId to KEYS in dedup.ts diffGrant**

The `KEYS` array should NOT include `sourceId` — we don't want a different source to trigger an update. `sourceId` is set on insert only.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd scraper && npx vitest run tests/dedup.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scraper/src/pipeline/dedup.ts scraper/src/pipeline/save.ts scraper/tests/dedup.test.ts
git commit -m "feat(scraper): edition-aware dedup — insert new edition when expired grant reappears with new deadline"
```

---

### Task 5: Scraper — Update extractGrants to pass sourceId

**Files:**
- Modify: `scraper/src/pipeline/extract-grants.ts`
- Modify: `scraper/tests/extract-grants.test.ts`

**Interfaces:**
- Consumes: `RawPage.sourceId`
- Produces: `extractGrants` now includes `sourceId` on every `ExtractedGrant` and all new fields defaulted to null

- [ ] **Step 1: Update extractGrants signature to accept sourceId, update coerce()**

In `scraper/src/pipeline/extract-grants.ts`, update `coerce()` to accept `sourceId` parameter and return the full `ExtractedGrant` with new fields defaulted to null:
```typescript
function coerce(raw: unknown, sourceId: string): ExtractedGrant | null {
  // ... existing validation ...
  return {
    title, url, sourceId, deadline, status,
    amount: numOrNull(o.amount),
    cofundingRequired: numOrNull(o.cofundingRequired),
    cofundingPercentage: null, // filled by detail extraction
    eligibleTypes: stringArray(o.eligibleTypes).filter((t) => LEGAL_TYPE_SET.has(t)),
    tags: stringArray(o.tags).filter((t) => TAG_SET.has(t)),
    area: stringOrNull(o.area),
    geoScope, complexity,
    requiredDocuments: stringArray(o.requiredDocuments).filter((d) => DOCUMENT_KEY_SET.has(d)),
    summary: stringOrNull(o.summary),
    requirements: stringOrNull(o.requirements),
    beneficiaries: stringOrNull(o.beneficiaries),
    openingDate: null,
    fundingType: null,
    minAmount: null,
    maxAmount: null,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: null,
  };
}
```

Update `extractGrants` to pass `page.sourceId` and remove the separate `Omit<ExtractedGrant, "providerId">` type — `coerce` now returns a full `ExtractedGrant` (with `providerId` still resolved separately, so keep the Omit pattern but adjust to `Omit<ExtractedGrant, "providerId">`).

Actually, looking at the current code: `coerce` returns `Omit<ExtractedGrant, "providerId"> | null` and then `providerId` is added after. Since `sourceId` is now on `ExtractedGrant` and known up front (from `page.sourceId`), it should be included in coerce's output. Adjust:

```typescript
function coerce(raw: unknown, sourceId: string): Omit<ExtractedGrant, "providerId"> | null {
  // ... existing checks ...
  return {
    title, url, sourceId, deadline, status,
    // ... all fields including new ones defaulted to null ...
  };
}

export async function extractGrants(
  page: RawPage, deps: { llm: LLMProvider; db: GrantsDb },
): Promise<ExtractedGrant[]> {
  // ... existing code ...
  for (const item of raw) {
    const coerced = coerce(item, page.sourceId);
    if (!coerced) continue;
    const providerId = await resolveProviderId(item, deps.db);
    out.push({ ...coerced, providerId });
  }
  return out;
}
```

- [ ] **Step 2: Update extract-grants tests**

Update the `page()` helper and test expectations to include `sourceId`:
```typescript
const page = (html: string): RawPage => ({ sourceId: "s1", url: "https://x/list", html });
```
This already exists. Just ensure test assertions don't break with the new fields.

- [ ] **Step 3: Run tests**

```bash
cd scraper && npx vitest run tests/extract-grants.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scraper/src/pipeline/extract-grants.ts scraper/tests/extract-grants.test.ts
git commit -m "feat(scraper): extractGrants passes sourceId and initializes new v2 fields to null"
```

---

### Task 6: Scraper — Update SupabaseGrantsDb for new columns and scrape_logs

**Files:**
- Modify: `scraper/src/db/supabase-grants-db.ts`
- Modify: `scraper/tests/supabase-grants-db.test.ts`
- Modify: `scraper/tests/helpers/memory-db.ts`

**Interfaces:**
- Consumes: `ExtractedGrant` with new fields
- Produces: `grantToInsertRow()` maps new fields; `GrantsDb` gets `logScrapeRun()`, `markDetailFetched()`, `findGrantsNeedingDetail()`

- [ ] **Step 1: Update grantToInsertRow and patchToUpdateRow**

In `scraper/src/db/supabase-grants-db.ts`, add the new column mappings:
```typescript
export function grantToInsertRow(grant: ExtractedGrant): GrantInsertRow {
  return {
    title: grant.title,
    url: grant.url,
    source_id: grant.sourceId,
    provider_id: grant.providerId,
    deadline: grant.deadline,
    status: grant.status ?? DEFAULT_STATUS,
    amount: grant.amount,
    cofunding_required: grant.cofundingRequired,
    cofunding_percentage: grant.cofundingPercentage,
    eligible_types: grant.eligibleTypes,
    tags: grant.tags,
    area: grant.area,
    geo_scope: grant.geoScope,
    complexity: grant.complexity,
    required_documents: grant.requiredDocuments,
    summary: grant.summary,
    requirements: grant.requirements,
    beneficiaries: grant.beneficiaries,
    opening_date: grant.openingDate,
    funding_type: grant.fundingType,
    min_amount: grant.minAmount,
    max_amount: grant.maxAmount,
    eligible_expenses: grant.eligibleExpenses,
    application_method: grant.applicationMethod,
    contact_info: grant.contactInfo,
  };
}
```

Update `COLUMN_OF` to include new fields:
```typescript
const COLUMN_OF: Record<keyof ExtractedGrant, string> = {
  title: "title", url: "url", sourceId: "source_id", providerId: "provider_id",
  deadline: "deadline", status: "status", amount: "amount",
  cofundingRequired: "cofunding_required", cofundingPercentage: "cofunding_percentage",
  eligibleTypes: "eligible_types", tags: "tags", area: "area",
  geoScope: "geo_scope", complexity: "complexity",
  requiredDocuments: "required_documents", summary: "summary",
  requirements: "requirements", beneficiaries: "beneficiaries",
  openingDate: "opening_date", fundingType: "funding_type",
  minAmount: "min_amount", maxAmount: "max_amount",
  eligibleExpenses: "eligible_expenses", applicationMethod: "application_method",
  contactInfo: "contact_info",
};
```

- [ ] **Step 2: Add new GrantsDb methods to the interface in types.ts**

```typescript
export interface ScrapeLogEntry {
  sourceId: string;
  phase: "listing" | "detail";
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  detailErrors: string[];
  durationMs: number | null;
}

export interface GrantsDb {
  findByUrl(normalizedUrl: string): Promise<StoredGrant | null>;
  insert(grant: ExtractedGrant): Promise<void>;
  update(id: string, patch: Partial<ExtractedGrant>): Promise<void>;
  findProviderIdByName(name: string): Promise<string | null>;
  updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void>;
  logScrapeRun(entry: ScrapeLogEntry): Promise<void>;
  markDetailFetched(grantId: string): Promise<void>;
  findGrantsNeedingDetail(sourceId: string, maxAttempts: number): Promise<StoredGrant[]>;
}
```

- [ ] **Step 3: Implement new methods in SupabaseGrantsDb**

```typescript
async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
  const { error } = await this.client.from("scrape_logs").insert({
    source_id: entry.sourceId,
    phase: entry.phase,
    inserted: entry.inserted,
    updated: entry.updated,
    skipped: entry.skipped,
    errors: entry.errors,
    detail_errors: entry.detailErrors,
    duration_ms: entry.durationMs,
  });
  fail("logScrapeRun", error);
}

async markDetailFetched(grantId: string): Promise<void> {
  const { error } = await this.client.from("grants").update({
    detail_fetched_at: new Date().toISOString(),
    detail_fetch_attempts: 0, // reset on success
  }).eq("id", grantId);
  fail("markDetailFetched", error);
}

async findGrantsNeedingDetail(sourceId: string, maxAttempts: number): Promise<StoredGrant[]> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await this.client
    .from("grants")
    .select("*")
    .eq("source_id", sourceId)
    .neq("status", "scaduto")
    .lt("detail_fetch_attempts", maxAttempts)
    .or(`detail_fetched_at.is.null,detail_fetched_at.lt.${weekAgo}`)
    .limit(20);
  fail("findGrantsNeedingDetail", error);
  return (data ?? []).map((row) => rowToStoredGrant(row as Record<string, unknown>));
}
```

- [ ] **Step 4: Update rowToStoredGrant for new fields**

```typescript
export function rowToStoredGrant(row: Record<string, unknown>): StoredGrant {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    sourceId: (row.source_id as string | null) ?? "",
    providerId: (row.provider_id as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    status: (row.status as GrantStatus | null) ?? null,
    amount: (row.amount as number | null) ?? null,
    cofundingRequired: (row.cofunding_required as number | null) ?? null,
    cofundingPercentage: (row.cofunding_percentage as number | null) ?? null,
    eligibleTypes: (row.eligible_types as string[] | null) ?? [],
    tags: (row.tags as string[] | null) ?? [],
    area: (row.area as string | null) ?? null,
    geoScope: (row.geo_scope as GeoScope | null) ?? null,
    complexity: (row.complexity as Complexity | null) ?? null,
    requiredDocuments: (row.required_documents as string[] | null) ?? [],
    summary: (row.summary as string | null) ?? null,
    requirements: (row.requirements as string | null) ?? null,
    beneficiaries: (row.beneficiaries as string | null) ?? null,
    openingDate: (row.opening_date as string | null) ?? null,
    fundingType: (row.funding_type as FundingType | null) ?? null,
    minAmount: (row.min_amount as number | null) ?? null,
    maxAmount: (row.max_amount as number | null) ?? null,
    eligibleExpenses: (row.eligible_expenses as string | null) ?? null,
    applicationMethod: (row.application_method as string | null) ?? null,
    contactInfo: (row.contact_info as string | null) ?? null,
  };
}
```

- [ ] **Step 5: Update InMemoryGrantsDb with new methods**

```typescript
export class InMemoryGrantsDb implements GrantsDb {
  grants: StoredGrant[] = [];
  sources: Record<string, { lastRunAt?: string; lastError?: string | null }> = {};
  logs: ScrapeLogEntry[] = [];
  providers: Record<string, string>;
  private seq = 0;

  constructor(providers: Record<string, string> = {}) { this.providers = providers; }

  async findByUrl(url: string): Promise<StoredGrant | null> {
    return this.grants.find((g) => g.url === url) ?? null;
  }
  async insert(grant: ExtractedGrant): Promise<void> {
    this.grants.push({ ...grant, id: `g${++this.seq}` });
  }
  async update(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    const g = this.grants.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  }
  async findProviderIdByName(name: string): Promise<string | null> {
    return this.providers[name] ?? null;
  }
  async updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void> {
    this.sources[sourceId] = { ...this.sources[sourceId], ...patch };
  }
  async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
    this.logs.push(entry);
  }
  async markDetailFetched(grantId: string): Promise<void> {
    const g = this.grants.find((x) => x.id === grantId);
    if (g) (g as Record<string, unknown>).detailFetchedAt = new Date().toISOString();
  }
  async findGrantsNeedingDetail(_sourceId: string, _maxAttempts: number): Promise<StoredGrant[]> {
    return this.grants.filter((g) =>
      g.status !== "scaduto" && !(g as Record<string, unknown>).detailFetchedAt
    );
  }
}
```

- [ ] **Step 6: Run all scraper tests**

```bash
cd scraper && npx vitest run
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scraper/src/db/supabase-grants-db.ts scraper/src/pipeline/types.ts scraper/tests/helpers/memory-db.ts scraper/tests/supabase-grants-db.test.ts
git commit -m "feat(scraper): SupabaseGrantsDb v2 — new columns, scrape_logs, detail tracking methods"
```

---

### Task 7: Scraper — Throttle utility

**Files:**
- Create: `scraper/src/pipeline/throttle.ts`
- Test: `scraper/tests/throttle.test.ts`

**Interfaces:**
- Produces: `throttledLoop<T>(items: T[], fn: (item: T) => Promise<void>, delayMs: number, sleep?): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { throttledLoop } from "../src/pipeline/throttle";

describe("throttledLoop", () => {
  it("calls fn for each item with a delay between calls", async () => {
    const calls: number[] = [];
    const sleep = vi.fn().mockResolvedValue(undefined);
    await throttledLoop([1, 2, 3], async (n) => { calls.push(n); }, 6000, sleep);
    expect(calls).toEqual([1, 2, 3]);
    expect(sleep).toHaveBeenCalledTimes(2); // no sleep after last item
    expect(sleep).toHaveBeenCalledWith(6000);
  });

  it("does not sleep for a single item", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await throttledLoop([1], async () => {}, 6000, sleep);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not throw when an item's fn throws (continues to next)", async () => {
    const results: string[] = [];
    const errors: string[] = [];
    const sleep = vi.fn().mockResolvedValue(undefined);
    await throttledLoop(
      ["a", "b", "c"],
      async (item) => {
        if (item === "b") throw new Error("fail b");
        results.push(item);
      },
      100,
      sleep,
      (item, err) => { errors.push(`${item}:${(err as Error).message}`); },
    );
    expect(results).toEqual(["a", "c"]);
    expect(errors).toEqual(["b:fail b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scraper && npx vitest run tests/throttle.test.ts
```

- [ ] **Step 3: Write throttle.ts**

```typescript
const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function throttledLoop<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  delayMs: number,
  sleep: (ms: number) => Promise<void> = realSleep,
  onError?: (item: T, err: unknown) => void,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    try {
      await fn(items[i]!);
    } catch (err) {
      if (onError) onError(items[i]!, err);
    }
    if (i < items.length - 1) await sleep(delayMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scraper && npx vitest run tests/throttle.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/throttle.ts scraper/tests/throttle.test.ts
git commit -m "feat(scraper): throttledLoop utility for rate-limited sequential processing"
```

---

### Task 8: Scraper — Rewrite runPipeline for two-phase flow with logging

**Files:**
- Modify: `scraper/src/pipeline/run.ts`
- Modify: `scraper/tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `extractGrants`, `extractDetail`, `enrich`, `saveGrant`, `throttledLoop`, `GrantsDb.logScrapeRun/markDetailFetched/findGrantsNeedingDetail`, `PageFetcher`
- Produces: `runPipeline()` now runs listing + detail phases, logs each phase, throttles Gemini calls

- [ ] **Step 1: Rewrite run.ts**

```typescript
import type { LLMProvider } from "../providers/types";
import type { GrantsDb, PageFetcher, PipelineResult, SourceConfig } from "./types";
import { extractGrants } from "./extract-grants";
import { extractDetail } from "./extract-detail";
import { enrich } from "./enrich";
import { saveGrant } from "./save";
import { throttledLoop } from "./throttle";

const DETAIL_THROTTLE_MS = 7_000;
const MAX_DETAIL_ATTEMPTS = 3;

export async function runPipeline(
  sources: SourceConfig[],
  deps: { fetcher: PageFetcher; llm: LLMProvider; db: GrantsDb },
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const source of sources) {
    const result: PipelineResult = {
      sourceId: source.id, inserted: 0, updated: 0, skipped: 0, errors: [], detailErrors: [],
    };
    const listingStart = Date.now();
    try {
      const pages = await deps.fetcher.fetchPages(source);
      for (const page of pages) {
        const grants = await extractGrants(page, { llm: deps.llm, db: deps.db });
        for (const raw of grants) {
          const outcome = await saveGrant(enrich(raw), deps.db);
          result[outcome] += 1;
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    await deps.db.logScrapeRun({
      sourceId: source.id,
      phase: "listing",
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      detailErrors: [],
      durationMs: Date.now() - listingStart,
    });

    // Phase 2: detail enrichment for grants that need it
    const detailStart = Date.now();
    let detailUpdated = 0;
    try {
      const needDetail = await deps.db.findGrantsNeedingDetail(source.id, MAX_DETAIL_ATTEMPTS);
      await throttledLoop(
        needDetail,
        async (grant) => {
          let html: string;
          try {
            const [detailPage] = await deps.fetcher.fetchPages({
              id: source.id, name: source.name, url: grant.url,
            });
            html = detailPage?.html ?? "";
          } catch (err) {
            result.detailErrors.push(`fetch ${grant.url}: ${err instanceof Error ? err.message : String(err)}`);
            await deps.db.update(grant.id, {} as any); // bump detail_fetch_attempts handled below
            return;
          }
          if (!html) return;

          const detail = await extractDetail(html, { llm: deps.llm });
          if (detail) {
            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(detail)) {
              if (v != null && (Array.isArray(v) ? v.length > 0 : true)) {
                patch[k] = v;
              }
            }
            if (Object.keys(patch).length > 0) {
              await deps.db.update(grant.id, patch as any);
              detailUpdated++;
            }
          }
          await deps.db.markDetailFetched(grant.id);
        },
        DETAIL_THROTTLE_MS,
        undefined,
        (grant, err) => {
          result.detailErrors.push(`${grant.url}: ${err instanceof Error ? err.message : String(err)}`);
        },
      );
    } catch (err) {
      result.detailErrors.push(err instanceof Error ? err.message : String(err));
    }

    if (needDetail?.length) {
      await deps.db.logScrapeRun({
        sourceId: source.id,
        phase: "detail",
        inserted: 0,
        updated: detailUpdated,
        skipped: 0,
        errors: [],
        detailErrors: result.detailErrors,
        durationMs: Date.now() - detailStart,
      });
    }

    await deps.db.updateSource(source.id, {
      lastRunAt: new Date().toISOString(),
      lastError: result.errors.length || result.detailErrors.length
        ? [...result.errors, ...result.detailErrors].join("; ")
        : null,
    });
    results.push(result);
  }
  return results;
}
```

Note: The `needDetail` variable needs to be declared outside the try block or the `if` check at the end needs adjustment. Fix: declare `let needDetail` before the try.

- [ ] **Step 2: Update pipeline tests**

Update the existing tests to account for `detailErrors` in `PipelineResult`, and add new tests for the detail phase:

```typescript
// Add to existing describe block:
it("runs detail phase for grants without detail_fetched_at", async () => {
  const deps = makeDeps();
  // First run inserts grants
  await runPipeline(sources, deps);
  // Grants are now in DB without detailFetchedAt
  // The detail phase should find them via findGrantsNeedingDetail
  expect(deps.db.grants.length).toBe(3);
  // Detail would have been attempted — since FakeLLM has no mapping for the
  // grant URLs' HTML, extractDetail returns null (no error, just no enrichment)
});
```

- [ ] **Step 3: Run tests**

```bash
cd scraper && npx vitest run
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scraper/src/pipeline/run.ts scraper/tests/pipeline.test.ts
git commit -m "feat(scraper): two-phase pipeline — listing + throttled detail enrichment with logging"
```

---

### Task 9: Scraper — Update exports and production runner

**Files:**
- Modify: `scraper/src/index.ts`
- Modify: `scraper/src/run-production.ts`

**Interfaces:**
- Produces: new exports for `extractDetail`, `throttledLoop`; `DryRunGrantsDb` implements new methods

- [ ] **Step 1: Update index.ts exports**

Add:
```typescript
export { extractDetail } from "./pipeline/extract-detail";
export { throttledLoop } from "./pipeline/throttle";
```

- [ ] **Step 2: Update DryRunGrantsDb in run-production.ts**

Add no-op implementations of the new GrantsDb methods:
```typescript
async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
  console.log(`[dry-run] scrape log: phase=${entry.phase} ins=${entry.inserted} upd=${entry.updated} skip=${entry.skipped} errs=${entry.errors.length}`);
}
async markDetailFetched(grantId: string): Promise<void> {
  console.log(`[dry-run] markDetailFetched ${grantId}`);
}
async findGrantsNeedingDetail(sourceId: string, maxAttempts: number): Promise<StoredGrant[]> {
  return this.real.findGrantsNeedingDetail(sourceId, maxAttempts);
}
```

- [ ] **Step 3: Run full test suite**

```bash
cd scraper && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add scraper/src/index.ts scraper/src/run-production.ts
git commit -m "feat(scraper): update exports and DryRunGrantsDb for v2 pipeline"
```

---

### Task 10: App — Update matching types and mapping for new grant fields

**Files:**
- Modify: `app/src/lib/matching/types.ts`
- Modify: `app/src/lib/matching/indicators.ts`
- Modify: `app/src/lib/grants/mapping.ts`
- Modify: `app/src/lib/matching/helpers.ts`
- Test: existing matching tests

**Interfaces:**
- Consumes: new DB columns
- Produces: `Grant` type with new fields, `cofundingRequired` stays as euro amount, `cofundingPercentage` used in indicator, `GrantStatus` includes `"scaduto"`

- [ ] **Step 1: Update Grant type in matching/types.ts**

```typescript
export type GrantStatus = "aperto" | "chiuso" | "scaduto";
export type FundingType = "fondo_perduto" | "prestito_agevolato" | "contributo_misto" | "garanzia" | "premio";

export interface Grant {
  id: string;
  title: string;
  providerId: string | null;
  providerKind: ProviderKind | null;
  deadline: string | null;
  status: GrantStatus;
  amount: number | null;
  cofundingRequired: number | null;
  cofundingPercentage: number | null;
  eligibleTypes: string[];
  tags: string[];
  area: string | null;
  geoScope: GeoScope | null;
  complexity: ComplexityLevel | null;
  requiredDocuments: string[];
  summary: string;
  requirements: string;
  url: string;
  beneficiaries: string;
  openingDate: string | null;
  fundingType: FundingType | null;
  minAmount: number | null;
  maxAmount: number | null;
  eligibleExpenses: string | null;
  applicationMethod: string | null;
  contactInfo: string | null;
}
```

- [ ] **Step 2: Fix cofundingIndicator to use cofundingPercentage**

In `app/src/lib/matching/indicators.ts`:
```typescript
function cofundingIndicator(profile: EntityProfile, grant: Grant): CofundingIndicator {
  const required = grant.cofundingPercentage;
  if (required == null) return { required: null, color: "grigio", label: "cofinanziamento non specificato" };
  const capacity = profile.cofundingCapacity;
  let color: CofundingIndicator["color"] = "giallo";
  if (capacity != null && capacity >= required) color = "verde";
  else if (required > 20) color = "rosso";
  return { required, color, label: `cofinanziamento richiesto ${required}%` };
}
```

- [ ] **Step 3: Update isClosedGrant in helpers.ts**

```typescript
export function isClosedGrant(grant: Grant): boolean {
  if (grant.status === "chiuso" || grant.status === "scaduto") return true;
  const days = deadlineDays(grant.deadline);
  return days != null && days <= 0;
}
```

- [ ] **Step 4: Update mapping.ts**

```typescript
export function mapGrantRow(row: GrantRowWithProvider): GrantView {
  const grant: Grant = {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    providerKind: row.provider?.kind ?? null,
    deadline: row.deadline,
    status: row.status,
    amount: row.amount,
    cofundingRequired: row.cofunding_required,
    cofundingPercentage: row.cofunding_percentage,
    eligibleTypes: row.eligible_types,
    tags: row.tags,
    area: row.area,
    geoScope: row.geo_scope,
    complexity: row.complexity,
    requiredDocuments: row.required_documents,
    summary: row.summary ?? "",
    requirements: row.requirements ?? "",
    url: row.url,
    beneficiaries: row.beneficiaries ?? "",
    openingDate: row.opening_date ?? null,
    fundingType: row.funding_type ?? null,
    minAmount: row.min_amount ?? null,
    maxAmount: row.max_amount ?? null,
    eligibleExpenses: row.eligible_expenses ?? null,
    applicationMethod: row.application_method ?? null,
    contactInfo: row.contact_info ?? null,
  };
  return { grant, providerName: row.provider?.name ?? null };
}
```

- [ ] **Step 5: Regenerate Supabase database types**

Run via Supabase MCP `generate_typescript_types` and save to `app/src/lib/supabase/database.types.ts`.

- [ ] **Step 6: Fix the AI analysis prompt — cofundingRequired is euros, not %**

In `app/src/lib/ai/analyze-grant.ts`, fix line 78:
```typescript
`Importo: ${grant.amount != null ? `€ ${grant.amount}` : "n/d"} — Cofinanziamento: ${grant.cofundingPercentage != null ? `${grant.cofundingPercentage}%` : "n/d"} (importo: ${grant.cofundingRequired != null ? `€ ${grant.cofundingRequired}` : "n/d"})`,
```

- [ ] **Step 7: Run app tests**

```bash
cd app && npx vitest run
```
Expected: some failures due to type changes — fix test fixtures.

- [ ] **Step 8: Fix test fixtures for new Grant shape**

Find all test files that create `Grant` objects and add the new fields with defaults (`null` for nullable, `""` for strings).

- [ ] **Step 9: Run all tests again**

```bash
cd app && npx vitest run
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/src/lib/matching/types.ts app/src/lib/matching/indicators.ts app/src/lib/matching/helpers.ts app/src/lib/grants/mapping.ts app/src/lib/ai/analyze-grant.ts app/src/lib/supabase/database.types.ts
git commit -m "feat(app): Grant type v2 — new fields, cofundingPercentage in indicator, scaduto status, AI prompt fix"
```

---

### Task 11: App — Update grant detail page to show new fields

**Files:**
- Modify: `app/src/app/(app)/bandi/[id]/page.tsx`

**Interfaces:**
- Consumes: `Grant` with new fields

- [ ] **Step 1: Add new sections to the detail page**

After the existing beneficiaries section, add:
```tsx
{grant.fundingType && (
  <section className="detail-section">
    <h2>Tipo di finanziamento</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
      {grant.fundingType.replace(/_/g, " ")}
    </p>
  </section>
)}

{(grant.minAmount != null || grant.maxAmount != null) && (
  <section className="detail-section">
    <h2>Range importo</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
      {grant.minAmount != null ? `€ ${grant.minAmount.toLocaleString("it-IT")}` : "—"}
      {" – "}
      {grant.maxAmount != null ? `€ ${grant.maxAmount.toLocaleString("it-IT")}` : "—"}
    </p>
  </section>
)}

{grant.eligibleExpenses && (
  <section className="detail-section">
    <h2>Spese ammissibili</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
      {grant.eligibleExpenses}
    </p>
  </section>
)}

{grant.applicationMethod && (
  <section className="detail-section">
    <h2>Modalità di candidatura</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
      {grant.applicationMethod}
    </p>
  </section>
)}

{grant.contactInfo && (
  <section className="detail-section">
    <h2>Contatti</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
      {grant.contactInfo}
    </p>
  </section>
)}

{grant.openingDate && (
  <section className="detail-section">
    <h2>Data apertura</h2>
    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
      {new Date(grant.openingDate + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
    </p>
  </section>
)}
```

- [ ] **Step 2: Run app build to verify no type errors**

```bash
cd app && npx next build
```

- [ ] **Step 3: Commit**

```bash
git add app/src/app/\(app\)/bandi/\[id\]/page.tsx
git commit -m "feat(app): grant detail page shows new v2 fields (funding type, amount range, expenses, method, contacts, opening date)"
```

---

### Task 12: Update cron route and vercel.json for split schedule

**Files:**
- Modify: `app/src/app/api/cron/scrape/route.ts`
- Modify: `app/vercel.json`

**Interfaces:**
- Produces: cron now has `maxDuration = 600` (10 min), runs daily at 3 AM

- [ ] **Step 1: Update maxDuration in cron route**

```typescript
export const maxDuration = 600; // 10 min — v2 pipeline with detail fetching needs more time
```

- [ ] **Step 2: Update vercel.json schedule**

Change scrape from every 2 days to daily (since we now have throttling and skip-already-enriched logic):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/digest",
      "schedule": "0 7 * * 1"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/app/api/cron/scrape/route.ts app/vercel.json
git commit -m "feat(cron): increase maxDuration to 600s and run scrape daily for v2 detail pipeline"
```

---

### Task 13: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full scraper test suite**

```bash
cd scraper && npx vitest run
```
Expected: all pass

- [ ] **Step 2: Run full app test suite**

```bash
cd app && npx vitest run
```
Expected: all pass

- [ ] **Step 3: Build both packages**

```bash
cd scraper && npm run build
cd app && npx next build
```
Expected: clean build

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd scraper && npx tsc --noEmit
cd app && npx tsc --noEmit
```

- [ ] **Step 5: Push the branch**

```bash
git push -u origin claude/bandi-scanner-v2-recap-cqqh4s
```
