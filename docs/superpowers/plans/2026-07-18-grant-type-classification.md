# Grant Type Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every grant at ingest as `bando`, `co_progettazione`, or `amministrativo` from its title/summary; drop `amministrativo` notices (proroghe/rettifiche) before they ever reach the DB, and label `co_progettazione` (persisted, visible, filterable) instead of showing it as an ordinary bando.

**Architecture:** One pure classifier (`classifyGrantType`) runs once per grant inside the scraper's existing universal `enrich()` step — the same choke point every archetype already passes through via `saveGrant(enrich(raw), db)`. `decide()` gains an insert-only gate that skips `amministrativo`. The DB stores only `{bando, co_progettazione}`. The app carries the field through mapping → `Grant` → a new `GrantTypeBadge` (renders only for `co_progettazione`) → an additive list filter, mirroring the existing `tags`/`geoScopes` filter pattern.

**Tech Stack:** TypeScript, Vitest, Next.js 16 (React 19), Supabase Postgres.

## Global Constraints

- UI language Italian; code and comments English (repo convention).
- The stored column `grant_type` holds only `'bando'` or `'co_progettazione'` — `amministrativo` is a classifier outcome that causes a `skip` in `decide()` and is **never** written to the DB.
- Classification runs **once, universally**, inside `enrich()` — not per-archetype. It is a pure function of `title` + `summary`, both already available at listing time.
- The `decide()` gate applies **only to inserts** (mirrors the existing `isExpiredAtIngest` gate). An already-stored grant is never re-skipped or deleted based on a type re-classification; `grantType` is deliberately excluded from `dedup.ts`'s `KEYS` array so the update path never silently changes a stored grant's type.
- No DB `CHECK` constraint on `grant_type` — validated app-side, consistent with `status`/`funding_type`.
- TDD throughout: write the failing test, watch it fail, implement minimally, watch it pass, commit.

---

### Task 1: Grant type classifier (pure function)

**Files:**
- Create: `scraper/src/pipeline/grant-type.ts`
- Test: `scraper/tests/grant-type.test.ts`

**Interfaces:**
- Produces: `export type GrantType = "bando" | "co_progettazione" | "amministrativo";` and `export function classifyGrantType(title: string, summary: string | null): GrantType;` — consumed by Task 2 (`enrich.ts`).

- [ ] **Step 1: Write the failing test**

Create `scraper/tests/grant-type.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyGrantType } from "../src/pipeline/grant-type";

describe("classifyGrantType", () => {
  // Real titles in production (2026-07-18).
  it("classifies the real 'Una giustizia più inclusiva' co-progettazione notice", () => {
    const title = "Avviso pubblico per l'individuazione e il coinvolgimento di Enti del Terzo " +
      "Settore disponibili alla co-progettazione nell'ambito del Piano \"Una giustizia più inclusiva\"";
    expect(classifyGrantType(title, null)).toBe("co_progettazione");
  });
  it("classifies the real 'selezione di eventi' notice as an ordinary bando", () => {
    expect(classifyGrantType(
      "Avviso di selezione di eventi di rilevanza nazionale e internazionale  - 2026", null,
    )).toBe("bando");
  });
  it("classifies the real ORATORI notice as an ordinary bando", () => {
    expect(classifyGrantType(
      "Avviso per la selezione di interventi infrastrutturali destinati agli ORATORI delle aree urbane più fragili",
      null,
    )).toBe("bando");
  });

  // Administrative notices — anchored to the START of the title.
  it("classifies a proroga notice (no 'avviso' prefix) as amministrativo", () => {
    expect(classifyGrantType(
      "Proroga dei termini per la presentazione delle domande - Avviso ORATORI 2026", null,
    )).toBe("amministrativo");
  });
  it("classifies an 'avviso di rettifica' notice as amministrativo", () => {
    expect(classifyGrantType(
      "Avviso di rettifica del bando \"Eventi sportivi 2026\"", null,
    )).toBe("amministrativo");
  });
  it("classifies an errata corrige notice as amministrativo", () => {
    expect(classifyGrantType("Errata corrige - Avviso pubblico eventi 2026", null)).toBe("amministrativo");
  });
  it("classifies an 'avviso di differimento' notice as amministrativo", () => {
    expect(classifyGrantType("Avviso di differimento termini bando cultura 2026", null)).toBe("amministrativo");
  });

  // The anchoring is deliberate: a REAL bando that merely mentions "proroga" mid-title (not as
  // its subject) must NOT be discarded — only a notice whose subject IS the modification.
  it("does NOT classify a bando as amministrativo when 'proroga' appears mid-title, not at the start", () => {
    expect(classifyGrantType(
      "Sostegno agli impianti sportivi: possibile proroga dei termini in caso di forza maggiore", null,
    )).toBe("bando");
  });

  // Ambiguous case: "manifestazione di interesse" can precede a co-progettazione or be a plain
  // procedural notice. Per design, ambiguous → co_progettazione (visible + labeled), never
  // amministrativo (irreversible discard) — scarting is riskier than mislabeling.
  it("classifies an ambiguous 'manifestazione di interesse' as co_progettazione, not amministrativo", () => {
    expect(classifyGrantType(
      "Manifestazione di interesse per la selezione di partner nell'ambito del progetto Comunità Educante",
      null,
    )).toBe("co_progettazione");
  });

  // co_progettazione must also be detected from the summary alone, when the title is bland —
  // title/summary are both available already at listing time.
  it("classifies via the summary when the title alone gives no signal", () => {
    expect(classifyGrantType(
      "Avviso pubblico 2026",
      "Il presente avviso invita alla co-progettazione di servizi socio-educativi.",
    )).toBe("co_progettazione");
  });

  // Separator variants: hyphen, space, or none between "co" and "progettazione"/"programmazione".
  it("matches 'co progettazione' (space) and 'coprogrammazione' (no separator)", () => {
    expect(classifyGrantType("Invito alla co progettazione di servizi", null)).toBe("co_progettazione");
    expect(classifyGrantType("Avviso di coprogrammazione territoriale", null)).toBe("co_progettazione");
  });

  it("defaults to bando when nothing matches and summary is null", () => {
    expect(classifyGrantType("Contributo per l'acquisto di attrezzature sportive", null)).toBe("bando");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run tests/grant-type.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/grant-type'` (the module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `scraper/src/pipeline/grant-type.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run tests/grant-type.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/grant-type.ts scraper/tests/grant-type.test.ts
git commit -m "feat(scraper): classify grant type (bando/co_progettazione/amministrativo) from title+summary"
```

---

### Task 2: Wire classification into `ExtractedGrant` via `enrich()` (universal)

**Files:**
- Modify: `scraper/src/pipeline/types.ts:1-2` (import), `:73` (new field on `ExtractedGrant`)
- Modify: `scraper/src/pipeline/extract-grants.ts:141` (`coerce()` default)
- Modify: `scraper/src/pipeline/enrich.ts:68-73` (`enrich()` classifies)
- Modify: `scraper/tests/dedup.test.ts:5-15` (fixture default)
- Modify: `scraper/tests/enrich.test.ts:5-15` (fixture default) and add new `describe` block

**Interfaces:**
- Consumes: `classifyGrantType(title, summary)` from Task 1.
- Produces: `ExtractedGrant.grantType: GrantType` (required field) — consumed by Task 3 (`dedup.ts`) and Task 4 (`supabase-grants-db.ts`).

- [ ] **Step 1: Write the failing tests**

In `scraper/tests/enrich.test.ts`, first update the shared fixture factory (top of file) to include the new required field — change:

```typescript
function g(over: Partial<ExtractedGrant> = {}): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, sourceId: null, deadline: null, status: null,
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null,
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
  };
}
```

to:

```typescript
function g(over: Partial<ExtractedGrant> = {}): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, sourceId: null, deadline: null, status: null,
    grantType: "bando",
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null,
    openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
    ...over,
  };
}
```

Then append this new `describe` block at the end of `scraper/tests/enrich.test.ts`:

```typescript
describe("enrich — grant type classification", () => {
  it("classifies a co-progettazione title as co_progettazione", () => {
    expect(enrich(g({ title: "Avviso pubblico per la co-progettazione di servizi" })).grantType)
      .toBe("co_progettazione");
  });
  it("classifies a plain bando as bando", () => {
    expect(enrich(g({ title: "Avviso di selezione di eventi sportivi 2026" })).grantType).toBe("bando");
  });
  it("classifies a proroga notice as amministrativo", () => {
    expect(enrich(g({ title: "Proroga dei termini - Avviso ORATORI 2026" })).grantType).toBe("amministrativo");
  });
});
```

Also update the shared fixture factory in `scraper/tests/dedup.test.ts` (same edit: add `grantType: "bando",` right after `status: "aperto",` in the `g()` helper) so the file keeps compiling once `grantType` becomes a required field on `ExtractedGrant`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run tests/enrich.test.ts tests/dedup.test.ts`
Expected: FAIL — TypeScript error, `grantType` does not exist on type `ExtractedGrant` (the field hasn't been added yet), and/or the new `describe` block fails with `expected undefined to be "co_progettazione"`.

- [ ] **Step 3: Write minimal implementation**

In `scraper/src/pipeline/types.ts`, add the import (near the top, alongside the existing `vocab.ts` import):

```typescript
import type { GeoScope, Complexity, GrantStatus, FundingType } from "./vocab";
import type { GrantType } from "./grant-type";
import type { JsonSchema, LLMProvider } from "../providers/types";
```

Then, in the `ExtractedGrant` interface, add the field right after `status`:

```typescript
export interface ExtractedGrant {
  title: string;
  url: string;
  providerId: string | null;
  sourceId: string | null;
  deadline: string | null;        // ISO date or null
  status: GrantStatus | null;
  // Classified once by enrich() from title+summary. Stored value is always "bando" or
  // "co_progettazione" — "amministrativo" causes decide() to skip the insert (see dedup.ts) and
  // is never persisted. Deliberately excluded from dedup.ts's diff KEYS: a grant's type is fixed
  // at first classification and never silently changed by the update path.
  grantType: GrantType;
  amount: number | null;
  ...
```

(Leave the remaining fields of the interface unchanged.)

In `scraper/src/pipeline/extract-grants.ts`, in `coerce()`'s return object, add the default right after `status,` (the dumb placeholder — `enrich()` overwrites it with the real classification):

```typescript
  return {
    title, url, sourceId, deadline, status,
    grantType: "bando",
    amount: numOrNull(o.amount),
    ...
```

In `scraper/src/pipeline/enrich.ts`, add the import and classify inside `enrich()`:

```typescript
import type { ExtractedGrant } from "./types";
import type { GeoScope } from "./vocab";
import { classifyGrantType } from "./grant-type";
```

```typescript
export function enrich(grant: ExtractedGrant): ExtractedGrant {
  const status = grant.status ?? "aperto";
  let geoScope = grant.geoScope;
  if (geoScope == null && grant.area) geoScope = inferGeoScope(grant.area);
  const grantType = classifyGrantType(grant.title, grant.summary);
  return { ...grant, status, geoScope, grantType };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run tests/enrich.test.ts tests/dedup.test.ts`
Expected: PASS.

Then run the full scraper suite to confirm nothing else broke:

Run: `cd scraper && npm test`
Expected: PASS (all files) — `tests/supabase-grants-db.test.ts` will still fail at this point (it constructs a raw `ExtractedGrant` literal without `grantType`); that's expected and fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/types.ts scraper/src/pipeline/extract-grants.ts scraper/src/pipeline/enrich.ts scraper/tests/enrich.test.ts scraper/tests/dedup.test.ts
git commit -m "feat(scraper): classify grant type universally in enrich(), wire into ExtractedGrant"
```

---

### Task 3: Skip `amministrativo` notices at ingest (insert-only gate)

**Files:**
- Modify: `scraper/src/pipeline/dedup.ts:77-96` (`decide()`)
- Modify: `scraper/tests/dedup.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `ExtractedGrant.grantType` from Task 2.
- Produces: no new exports — `decide()`'s existing signature/behavior is extended, not changed.

- [ ] **Step 1: Write the failing test**

Append to `scraper/tests/dedup.test.ts`:

```typescript
describe("decide — skip administrative notices at ingest (proroga/rettifica/errata corrige/…)", () => {
  const TODAY = "2026-07-18";

  it("skips inserting a brand-new grant classified as amministrativo", () => {
    expect(decide(g({ grantType: "amministrativo", status: "aperto", deadline: "2026-12-31" }), null, TODAY))
      .toEqual({ action: "skip" });
  });

  it("still inserts a brand-new grant classified as co_progettazione", () => {
    expect(decide(g({ grantType: "co_progettazione", status: "aperto", deadline: "2026-12-31" }), null, TODAY))
      .toEqual({ action: "insert" });
  });

  it("skips a NEW EDITION of an expired grant when the new edition is amministrativo", () => {
    const incoming = g({ grantType: "amministrativo", status: "aperto", deadline: "2027-05-01" });
    const existing = g({ grantType: "bando", status: "scaduto", deadline: "2026-05-01" });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "skip" });
  });

  it("does not gate the update path on grantType — an active existing record updates normally", () => {
    const incoming = g({ grantType: "amministrativo", amount: 999 });
    const existing = g({ grantType: "bando", amount: 1 });
    expect(decide(incoming, existing, TODAY)).toEqual({ action: "update", patch: { amount: 999 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run tests/dedup.test.ts`
Expected: FAIL — the first three new tests get `{ action: "insert" }` instead of `{ action: "skip" }` (the gate doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `scraper/src/pipeline/dedup.ts`, replace:

```typescript
export function decide(
  incoming: ExtractedGrant,
  existing: ExtractedGrant | null,
  today: string = todayIso(),
): Decision {
  if (existing == null) {
    return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
  }

  const expired = existing.status === "scaduto" || existing.status === "chiuso";
  if (expired) {
    const newEdition = incoming.deadline != null && incoming.deadline !== existing.deadline;
    if (!newEdition) return { action: "skip" };
    // A new edition is still only worth inserting if that edition is itself still open.
    return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
```

with:

```typescript
// An administrative notice (proroga/rettifica/errata corrige/…) is never a new opportunity —
// skip it at insert time, same spirit as isExpiredAtIngest. Applies ONLY to inserts: a grant
// already stored keeps updating normally via the diffGrant path below regardless of grantType
// (grantType is excluded from KEYS — see the field's comment in types.ts).
function insertOrSkip(incoming: ExtractedGrant, today: string): Decision {
  if (incoming.grantType === "amministrativo") return { action: "skip" };
  return isExpiredAtIngest(incoming, today) ? { action: "skip" } : { action: "insert" };
}

export function decide(
  incoming: ExtractedGrant,
  existing: ExtractedGrant | null,
  today: string = todayIso(),
): Decision {
  if (existing == null) return insertOrSkip(incoming, today);

  const expired = existing.status === "scaduto" || existing.status === "chiuso";
  if (expired) {
    const newEdition = incoming.deadline != null && incoming.deadline !== existing.deadline;
    if (!newEdition) return { action: "skip" };
    // A new edition is still only worth inserting if that edition is itself still open.
    return insertOrSkip(incoming, today);
  }

  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run tests/dedup.test.ts`
Expected: PASS (all tests in the file, old and new).

Then: `cd scraper && npm test`
Expected: PASS for every file except `tests/supabase-grants-db.test.ts` (fixed in Task 4).

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/dedup.ts scraper/tests/dedup.test.ts
git commit -m "feat(scraper): skip amministrativo notices at ingest (insert-only gate)"
```

---

### Task 4: Persist `grant_type` (migration + Supabase adapter)

**Files:**
- Create: `app/supabase/migrations/0013_grant_type.sql`
- Modify: `scraper/src/db/supabase-grants-db.ts` (`grantToInsertRow`, `COLUMN_OF`, `rowToStoredGrant`, imports)
- Modify: `scraper/tests/supabase-grants-db.test.ts` (fixture + new assertions)

**Interfaces:**
- Consumes: `ExtractedGrant.grantType`, `GrantType` from Tasks 1-2.
- Produces: `grants.grant_type` column (text, default `'bando'`, not null); `StoredGrant.grantType` populated from the row.

- [ ] **Step 1: Write the failing tests**

In `scraper/tests/supabase-grants-db.test.ts`, update the shared `grant` fixture (near the top of the file) to add the new required field:

```typescript
const grant: ExtractedGrant = {
  title: "Bando A", url: "https://x/1", providerId: "p1", sourceId: "s1", deadline: "2026-12-31",
  status: null, grantType: "bando", amount: 5000, cofundingRequired: null,
  eligibleTypes: ["ONLUS"], tags: ["sport"], area: "Roma", geoScope: "nazionale",
  complexity: null, requiredDocuments: ["statuto"], summary: null, requirements: "req", beneficiaries: null,
  openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  cofundingPercentage: null, eligibleExpenses: null, applicationMethod: null, contactInfo: null,
};
```

Then add these two test cases — one to the existing `describe("grantToInsertRow", ...)` block, one as a new `describe` block right after `describe("rowToStoredGrant", ...)`:

```typescript
// inside describe("grantToInsertRow", ...), alongside the existing "maps camelCase..." test:
  it("maps grantType to the grant_type column", () => {
    expect(grantToInsertRow({ ...grant, grantType: "co_progettazione" }).grant_type).toBe("co_progettazione");
  });
```

```typescript
describe("rowToStoredGrant — grant_type", () => {
  it("maps the grant_type column back to grantType", () => {
    const stored = rowToStoredGrant({
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", grant_type: "co_progettazione", amount: null, cofunding_required: null,
      eligible_types: null, tags: [], area: null, geo_scope: null, complexity: null,
      required_documents: null, summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    });
    expect(stored.grantType).toBe("co_progettazione");
  });
  it("defaults grantType to bando when the column is absent (defensive fallback)", () => {
    const stored = rowToStoredGrant({
      id: "g1", title: "T", url: "https://x/1", provider_id: null, source_id: null, deadline: null,
      status: "aperto", amount: null, cofunding_required: null, eligible_types: null,
      tags: [], area: null, geo_scope: null, complexity: null, required_documents: null,
      summary: null, requirements: null, beneficiaries: null,
      opening_date: null, funding_type: null, min_amount: null, max_amount: null,
      cofunding_percentage: null, eligible_expenses: null, application_method: null, contact_info: null,
    });
    expect(stored.grantType).toBe("bando");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run tests/supabase-grants-db.test.ts`
Expected: FAIL — TypeScript error on the `grant` fixture (`grantType` missing), and `grantToInsertRow(...).grant_type` is `undefined` instead of `"co_progettazione"`, and `stored.grantType` is `undefined` instead of the expected value.

- [ ] **Step 3: Write minimal implementation**

In `scraper/src/db/supabase-grants-db.ts`, add the import:

```typescript
import type { ExtractedGrant, GrantAttachment, GrantsDb, ScrapeLogEntry, SourceConfig, StoredGrant } from "../pipeline/types";
import type { GeoScope, Complexity, GrantStatus, FundingType } from "../pipeline/vocab";
import type { GrantType } from "../pipeline/grant-type";
```

In `grantToInsertRow`, add the column right after `status`:

```typescript
export function grantToInsertRow(grant: ExtractedGrant): GrantInsertRow {
  return {
    title: grant.title,
    url: grant.url,
    provider_id: grant.providerId,
    source_id: grant.sourceId,
    deadline: grant.deadline,
    status: grant.status ?? DEFAULT_STATUS,
    grant_type: grant.grantType,
    amount: grant.amount,
    ...
```

In `COLUMN_OF`, add the mapping:

```typescript
const COLUMN_OF: Record<keyof ExtractedGrant, string> = {
  title: "title", url: "url", providerId: "provider_id", sourceId: "source_id",
  deadline: "deadline", status: "status", grantType: "grant_type", amount: "amount",
  ...
```

In `rowToStoredGrant`, add the mapping right after `status`:

```typescript
export function rowToStoredGrant(row: Record<string, unknown>): StoredGrant {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    providerId: (row.provider_id as string | null) ?? null,
    sourceId: (row.source_id as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    status: (row.status as GrantStatus | null) ?? null,
    grantType: (row.grant_type as GrantType | null) ?? "bando",
    amount: (row.amount as number | null) ?? null,
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run tests/supabase-grants-db.test.ts`
Expected: PASS.

Then run the whole scraper suite plus typecheck:

Run: `cd scraper && npm test && npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Create the migration file**

Create `app/supabase/migrations/0013_grant_type.sql`:

```sql
-- 0013: grant_type classification — distinguishes co-progettazioni (Terzo Settore co-designs a
-- public plan, still funded — e.g. "Una giustizia più inclusiva", 1.371.182,26 €) from ordinary
-- bandi. "amministrativo" (proroga/rettifica/errata corrige) is classified by the scraper but
-- never persisted: decide() skips those at ingest (scraper/src/pipeline/dedup.ts), so this
-- column only ever holds 'bando' or 'co_progettazione'. No CHECK constraint, validated app-side
-- (same convention as status/funding_type).
alter table grants add column if not exists grant_type text not null default 'bando';
```

(This migration is NOT applied here — application to the remote project happens in Task 8, the checkpoint, after explicit user go-ahead.)

- [ ] **Step 6: Commit**

```bash
git add scraper/src/db/supabase-grants-db.ts scraper/tests/supabase-grants-db.test.ts app/supabase/migrations/0013_grant_type.sql
git commit -m "feat(scraper,db): persist grant_type via a new migration and the Supabase adapter"
```

---

### Task 5: Carry `grantType` into the app's `Grant` type and data layer

**Files:**
- Modify: `app/src/lib/matching/types.ts:6` (new `GrantType` alias), `:74` (new field on `Grant`)
- Modify: `app/src/lib/matching/index.ts:21-27` (export `GrantType`)
- Modify: `app/src/lib/grants/mapping.ts:10-20` (map `row.grant_type`)
- Modify: `app/src/lib/grants/__tests__/mapping.test.ts:4-22` (fixture + assertion)
- Modify (one-line `grantType: "bando",` insertion into an existing `Grant`-typed object literal, immediately after each file's `contactInfo: null,` line):
  - `app/src/lib/matching/__tests__/calculate-match.test.ts` (`makeGrant` helper)
  - `app/src/lib/grants/__tests__/filters.test.ts` (`mg` helper, inside the `grant: {...}` object)
  - `app/src/lib/grants/__tests__/match-list.test.ts` (`grant` helper)
  - `app/src/lib/matching/__tests__/storico-match.test.ts` (`grant` helper)
  - `app/src/lib/ai/__tests__/analyze-grant.test.ts` (`grant` const)
  - `app/src/lib/alerts/__tests__/build-digest.test.ts` (`grant` const inside `view()`)
  - `app/src/lib/alerts/__tests__/run-batch.test.ts` (`grant` const)

**Interfaces:**
- Consumes: `GrantRow.grant_type` (from the regenerated `database.types.ts`, Task 8).
- Produces: `Grant.grantType: GrantType` — consumed by Task 6 (`GrantTypeBadge`) and Task 7 (`Filters.grantTypes`).

- [ ] **Step 1: Write the failing tests**

In `app/src/lib/matching/__tests__/calculate-match.test.ts`, in the `makeGrant` helper, add `grantType: "bando",` right after `cofundingPercentage: 10,`:

```typescript
function makeGrant(o: Partial<Grant> = {}): Grant {
  const d = new Date(); d.setDate(d.getDate() + 40);
  return {
    id: "g", title: "Sport inclusivo", providerId: null, providerKind: "pubblico",
    deadline: d.toISOString().split("T")[0], status: "aperto", amount: 20000, cofundingRequired: 10,
    cofundingPercentage: 10,
    grantType: "bando",
    eligibleTypes: ["ASD - Associazione Sportiva Dilettantistica"],
    ...
```

In `app/src/lib/grants/__tests__/mapping.test.ts`, add `grant_type: "bando",` to the `row()` factory (right after `required_documents: [...]`):

```typescript
function row(overrides: Partial<GrantRowWithProvider> = {}): GrantRowWithProvider {
  return {
    id: "g1", title: "Bando Sport 2026", provider_id: "prov1",
    deadline: "2026-12-31", status: "aperto", amount: 50000, cofunding_required: 20,
    eligible_types: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
    area: "Lombardia", geo_scope: "regionale", complexity: "media",
    required_documents: ["statuto", "bilancio"],
    grant_type: "bando",
    summary: null, requirements: null, beneficiaries: null,
    ...
```

and add a new test to the `describe("mapGrantRow", ...)` block:

```typescript
  it("maps grant_type to grantType", () => {
    expect(mapGrantRow(row({ grant_type: "co_progettazione" })).grant.grantType).toBe("co_progettazione");
  });
```

In each of the following files, add the single line `grantType: "bando",` immediately after the line containing `contactInfo: null,` inside the `Grant`-typed object literal (these are plain `: Grant` annotations or a `Partial<Grant>`-merging helper returning `Grant` — none use `as unknown as` casts, so they will fail to typecheck without this field):
- `app/src/lib/grants/__tests__/filters.test.ts` (inside `function mg(...)`'s `grant: {...}` object)
- `app/src/lib/grants/__tests__/match-list.test.ts` (inside `function grant(id, over)`)
- `app/src/lib/matching/__tests__/storico-match.test.ts` (inside `const grant = (over) => ({...})`)
- `app/src/lib/ai/__tests__/analyze-grant.test.ts` (inside `const grant: Grant = {...}`)
- `app/src/lib/alerts/__tests__/build-digest.test.ts` (inside `view()`'s `const grant: Grant = {...}`)
- `app/src/lib/alerts/__tests__/run-batch.test.ts` (inside `const grant: Grant = {...}`)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx tsc --noEmit -p .`
Expected: FAIL — multiple `error TS2353`/`TS2739`-style errors: `Property 'grantType' is missing in type '...' but required in type 'Grant'` (and `'grant_type' does not exist in type 'GrantRowWithProvider'` for `mapping.test.ts`, since `grant_type` isn't a column on `GrantRow` yet).

- [ ] **Step 3: Write minimal implementation**

In `app/src/lib/matching/types.ts`, add the type alias right after the existing `GrantStatus` alias:

```typescript
export type GrantStatus = "aperto" | "chiuso" | "scaduto";
// Narrower than the scraper's GrantType: "amministrativo" is a classifier outcome that causes
// decide() to skip the insert — it is never persisted, so the app never sees it.
export type GrantType = "bando" | "co_progettazione";
export type FundingType = "fondo_perduto" | "prestito_agevolato" | "contributo_misto" | "garanzia" | "premio";
```

In the `Grant` interface, add the field right after `status: GrantStatus;`:

```typescript
export interface Grant {
  id: string;
  title: string;
  providerId: string | null;
  providerKind: ProviderKind | null;
  deadline: string | null;         // ISO date
  status: GrantStatus;
  grantType: GrantType;
  amount: number | null;           // €
  ...
```

In `app/src/lib/matching/index.ts`, add `GrantType` to the type export list:

```typescript
export type {
  GeoScope, ComplexityLevel, CapacityLevel, ProviderKind, GrantStatus, GrantType, FundingType, ProjectOutcome,
  Verdict, CapacityAnswers, EntityDocuments, ProjectHistoryRow, EntityProfile, Grant, Attachment,
  DimensionScore, DimensionKey, BreakdownItem, BonusItem, Indicators, MatchResult,
  EconomicLevel, EconomicCoherence, EconomicIndicator,
  HistoryBadge, HistoryBadgeKind,
} from "./types";
```

In `app/src/lib/grants/mapping.ts`, add the mapping right after `status: row.status,`:

```typescript
export function mapGrantRow(row: GrantRowWithProvider): GrantView {
  const grant: Grant = {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    providerKind: row.provider?.kind ?? null,
    deadline: row.deadline,
    status: row.status,
    grantType: (row.grant_type as GrantType | undefined) ?? "bando",
    amount: row.amount,
    ...
```

Add the `GrantType` import to `mapping.ts`'s existing type import:

```typescript
import type { Attachment, Grant, GrantType, ProviderKind } from "@/lib/matching";
```

> **Note:** `GrantRowWithProvider`/`GrantRow` come from `Tables<"grants">` in `database.types.ts`, which doesn't have `grant_type` yet (that file is regenerated in Task 8, after the migration is actually applied). Until then, `row.grant_type` will be a TypeScript error (`Property 'grant_type' does not exist`). This is expected and resolved by Task 8 — do not hand-edit `database.types.ts` here.

- [ ] **Step 4: Run test to verify it passes**

Since `database.types.ts` isn't regenerated yet, full typecheck (`npx tsc --noEmit -p .`) will still fail specifically on `row.grant_type` in `mapping.ts` and on `grant_type` in the `mapping.test.ts` fixture. This is the one expected gap until Task 8. Confirm it's the ONLY remaining category of error:

Run: `cd app && npx tsc --noEmit -p . 2>&1 | grep -v "grant_type"`
Expected: no output (empty) — meaning every OTHER error introduced by this task's edits is gone, and the only remaining errors mention `grant_type` specifically (expected, closed by Task 8).

Then run the test suite (Vitest transpiles without full type-checking, so these will already pass at runtime):

Run: `cd app && npm test`
Expected: PASS for every file touched in this task.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/matching/types.ts app/src/lib/matching/index.ts app/src/lib/grants/mapping.ts \
  app/src/lib/matching/__tests__/calculate-match.test.ts app/src/lib/grants/__tests__/mapping.test.ts \
  app/src/lib/grants/__tests__/filters.test.ts app/src/lib/grants/__tests__/match-list.test.ts \
  app/src/lib/matching/__tests__/storico-match.test.ts app/src/lib/ai/__tests__/analyze-grant.test.ts \
  app/src/lib/alerts/__tests__/build-digest.test.ts app/src/lib/alerts/__tests__/run-batch.test.ts
git commit -m "feat(app): carry grantType through Grant type and row mapping"
```

---

### Task 6: `GrantTypeBadge` component, wired into the card and detail page

**Files:**
- Create: `app/src/components/grants/grant-type-badge.tsx`
- Modify: `app/src/components/grants/grant-card.tsx:1-7` (import), `:53-57` (render)
- Modify: `app/src/app/(app)/bandi/[id]/page.tsx:10-17` (import), `:64-67` (render)
- Modify: `app/src/components/grants/__tests__/grants-components.test.tsx` (new `describe` block + one GrantCard assertion)

**Interfaces:**
- Consumes: `Grant.grantType` from Task 5.
- Produces: `export function GrantTypeBadge({ grantType }: { grantType: GrantType }): JSX.Element | null` — consumed by `grant-card.tsx` and the detail page.

- [ ] **Step 1: Write the failing test**

Append to `app/src/components/grants/__tests__/grants-components.test.tsx` (add the import at the top alongside the others, then the new `describe` block after `DocumentChecklist`'s):

```typescript
import { GrantTypeBadge } from "../grant-type-badge";
```

```typescript
describe("GrantTypeBadge", () => {
  it("renders the co-progettazione label and data attribute", () => {
    const html = renderToStaticMarkup(<GrantTypeBadge grantType="co_progettazione" />);
    expect(html).toContain("Co-progettazione");
    expect(html).toContain('data-grant-type="co_progettazione"');
  });
  it("renders nothing for an ordinary bando", () => {
    const html = renderToStaticMarkup(<GrantTypeBadge grantType="bando" />);
    expect(html).toBe("");
  });
});
```

Also add one assertion to the existing first `GrantCard` test ("renders title link, provider, score and verdict"): change its `grant` object's `grantType` value — this fixture already needs `grantType: "bando"` per Task 5's note that `grants-components.test.tsx` uses `as unknown as MatchedGrant` (so it doesn't NEED the field to compile, but we set a real value here to exercise the badge). Update the first test's grant literal to add `grantType: "co_progettazione",` right after `cofundingPercentage: null,`, and add this assertion at the end of that test:

```typescript
    expect(html).toContain("Co-progettazione");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: FAIL — `Cannot find module '../grant-type-badge'`.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/components/grants/grant-type-badge.tsx`:

```typescript
import type { GrantType } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";

// Purely informational, no scoring impact: renders only for co_progettazione. An ordinary bando
// renders nothing — most grants never show this badge.
export function GrantTypeBadge({ grantType }: { grantType: GrantType }) {
  if (grantType !== "co_progettazione") return null;
  return (
    <Badge variant="secondary" data-grant-type={grantType}>
      Co-progettazione
    </Badge>
  );
}
```

In `app/src/components/grants/grant-card.tsx`, add the import:

```typescript
import { HistoryBadge } from "./history-badge";
import { GrantTypeBadge } from "./grant-type-badge";
```

and render it alongside the other badges:

```typescript
        <div className="relative flex flex-wrap items-center gap-1.5">
          <VerdictBadge verdict={match.verdict} />
          <GrantTypeBadge grantType={grant.grantType} />
          <DeadlineBadge indicator={match.indicators.deadline} />
          {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
        </div>
```

In `app/src/app/(app)/bandi/[id]/page.tsx`, add the import:

```typescript
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { GrantTypeBadge } from "@/components/grants/grant-type-badge";
```

and render it in the hero badges row:

```typescript
        <div className="detail-hero-badges">
          <VerdictBadge verdict={match.verdict} />
          <GrantTypeBadge grantType={grant.grantType} />
          {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: PASS.

Then: `cd app && npm test`
Expected: PASS across the whole app suite.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/grants/grant-type-badge.tsx app/src/components/grants/grant-card.tsx \
  "app/src/app/(app)/bandi/[id]/page.tsx" app/src/components/grants/__tests__/grants-components.test.tsx
git commit -m "feat(app): add GrantTypeBadge, wire into GrantCard and the bando detail page"
```

---

### Task 7: Additive list filter for grant type

**Files:**
- Modify: `app/src/lib/grants/filters.ts:1-14` (`Filters` type), `:16-38` (`applyFilters`), `:88-106` (`parseFilters`), `:108-120` (`serializeFilters`)
- Modify: `app/src/lib/grants/__tests__/filters.test.ts` (new assertions)
- Modify: `app/src/components/grants/filter-bar.tsx:1-11` (import + constant), `:74-88` (new fieldset)

**Interfaces:**
- Consumes: `Grant.grantType`, `GrantType` from Task 5.
- Produces: `Filters.grantTypes?: GrantType[]` — an additive/inclusive filter, same semantics as the existing `geoScopes`/`tags` fields (unset = show all; set = show only the listed types). Query-string key: `tipo`.

- [ ] **Step 1: Write the failing tests**

In `app/src/lib/grants/__tests__/filters.test.ts`, first give the `mg()` helper a `grantType` override (it already needs `grantType: "bando"` added per Task 5 — extend that same edit to accept an override):

```typescript
function mg(over: {
  id: string; score?: number; verdict?: Verdict; days?: number | null;
  amount?: number | null; geoScope?: GeoScope | null; tags?: string[]; grantType?: GrantType;
}): MatchedGrant {
  return {
    grant: {
      id: over.id, title: over.id, providerId: null, providerKind: null,
      deadline: null, status: "aperto", amount: over.amount ?? null, cofundingRequired: null,
      cofundingPercentage: null,
      grantType: over.grantType ?? "bando",
      eligibleTypes: [], tags: over.tags ?? [], area: null,
      ...
```

(Add `GrantType` to the existing `import type { Verdict, GeoScope } from "@/lib/matching";` line → `import type { Verdict, GeoScope, GrantType } from "@/lib/matching";`.)

Then add these tests to the `describe("applyFilters", ...)` block:

```typescript
  it("grantTypes filter keeps only the listed types (additive, like geoScopes/tags)", () => {
    const withType = [
      mg({ id: "a", grantType: "bando" }),
      mg({ id: "b", grantType: "co_progettazione" }),
    ];
    expect(applyFilters(withType, { grantTypes: ["co_progettazione"] }).map((m) => m.grant.id))
      .toEqual(["b"]);
  });
  it("empty/unset grantTypes shows everything (default)", () => {
    const withType = [mg({ id: "a", grantType: "bando" }), mg({ id: "b", grantType: "co_progettazione" })];
    expect(applyFilters(withType, {}).map((m) => m.grant.id)).toEqual(["a", "b"]);
  });
```

And extend the existing query-string round-trip test's `filters` object (in `describe("query-string round-trip", ...)`) to include the new field:

```typescript
  it("parse(serialize(x)) === x for a populated filter set", () => {
    const filters: Filters = {
      verdetti: ["Candidabile", "Da preparare"], onlyCandidabili: true,
      maxDeadlineDays: 30, minAmount: 1000, maxAmount: 200000,
      geoScopes: ["regionale"], tags: ["sport", "giovani"], grantTypes: ["co_progettazione"],
    };
    const sort: SortKey = "deadline";
    const qs = serializeFilters(filters, sort);
    const record = Object.fromEntries(new URLSearchParams(qs));
    expect(parseFilters(record)).toEqual({ filters, sort });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/grants/__tests__/filters.test.ts`
Expected: FAIL — TypeScript error (`grantTypes` doesn't exist on `Filters`), and the new assertions get the unfiltered list back instead of the filtered one.

- [ ] **Step 3: Write minimal implementation**

In `app/src/lib/grants/filters.ts`, update the imports and `Filters` type:

```typescript
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
```

In `applyFilters`, add the clause right after the `tags` clause:

```typescript
    if (f.tags && f.tags.length) {
      if (!m.grant.tags.some((t) => f.tags!.includes(t))) return false;
    }
    if (f.grantTypes && f.grantTypes.length) {
      if (!f.grantTypes.includes(m.grant.grantType)) return false;
    }
    return true;
```

In `parseFilters`, add the parsing right after the `tags` line:

```typescript
  const tags = list(sp.tag);
  if (tags) filters.tags = tags;
  const grantTypes = list(sp.tipo) as GrantType[] | undefined;
  if (grantTypes) filters.grantTypes = grantTypes;
```

In `serializeFilters`, add the serialization in the alphabetical run (right after `scadenza`, before `sort`, keeping the existing alphabetical-key-order comment honest — `tag` comes right after, so insert `tipo` after `tag`):

```typescript
  if (filters.maxDeadlineDays != null) p.set("scadenza", String(filters.maxDeadlineDays));
  if (sort !== "score") p.set("sort", sort);
  if (filters.tags && filters.tags.length) p.set("tag", filters.tags.join(","));
  if (filters.grantTypes && filters.grantTypes.length) p.set("tipo", filters.grantTypes.join(","));
  if (filters.verdetti && filters.verdetti.length) p.set("verdetto", filters.verdetti.join(","));
  return p.toString();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/grants/__tests__/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the UI toggle (no dedicated test — `filter-bar.tsx` has none today, consistent with its existing untested fieldsets)**

In `app/src/components/grants/filter-bar.tsx`, update the imports and add a local constant:

```typescript
"use client";
import { useRouter } from "next/navigation";
import { serializeFilters, type Filters, type SortKey } from "@/lib/grants/filters";
import type { Verdict, GeoScope, GrantType } from "@/lib/matching";
import type { DensityMode } from "@/lib/grants/view-density";
import { DensityToggle } from "./density-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const VERDICTS: Verdict[] = ["Candidabile", "Da preparare", "Da valutare", "Bassa priorità", "Non compatibile"];
const GEOS: GeoScope[] = ["comunale", "provinciale", "regionale", "nazionale", "europeo"];
const GRANT_TYPES: { value: GrantType; label: string }[] = [
  { value: "bando", label: "Bando" },
  { value: "co_progettazione", label: "Co-progettazione" },
];
```

Add the new fieldset inside the `<details className="filter-bar-more">` block, right after the "Ambito" fieldset:

```typescript
          <fieldset>
            <legend>Ambito</legend>
            {GEOS.map((g) => (
              <label key={g} className="filter-chip">
                <input type="checkbox" checked={filters.geoScopes?.includes(g) ?? false}
                  onChange={() => {
                    const geoScopes = toggle(filters.geoScopes, g);
                    go({ ...filters, geoScopes: geoScopes.length ? geoScopes : undefined }, sort);
                  }} />
                {g}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Tipo</legend>
            {GRANT_TYPES.map(({ value, label }) => (
              <label key={value} className="filter-chip">
                <input type="checkbox" checked={filters.grantTypes?.includes(value) ?? false}
                  onChange={() => {
                    const grantTypes = toggle(filters.grantTypes, value);
                    go({ ...filters, grantTypes: grantTypes.length ? grantTypes : undefined }, sort);
                  }} />
                {label}
              </label>
            ))}
          </fieldset>
```

Also add `filters.grantTypes?.length` to the `hasActiveSecondaryFilters` check so the "Altri filtri" panel auto-expands when a type filter is active:

```typescript
  const hasActiveSecondaryFilters = Boolean(
    filters.verdetti?.length || filters.geoScopes?.length || filters.grantTypes?.length ||
    filters.maxDeadlineDays != null || filters.minAmount != null || filters.maxAmount != null,
  );
```

- [ ] **Step 6: Verify nothing broke**

Run: `cd app && npm test && npx tsc --noEmit -p . 2>&1 | grep -v "grant_type"`
Expected: `npm test` PASS; the `tsc` output (with `grant_type` lines filtered out) is empty — i.e., no NEW type errors from this task, only the still-expected `grant_type` gap from Task 5, closed in Task 8.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/grants/filters.ts app/src/lib/grants/__tests__/filters.test.ts app/src/components/grants/filter-bar.tsx
git commit -m "feat(app): additive grant-type list filter (tipo=) + Tipo fieldset in FilterBar"
```

---

### Task 8: Checkpoint — apply the migration, regenerate types, backfill

> **This task touches the shared Supabase project. Do not run any step here without the user's explicit go-ahead** (per repo convention: no production writes without confirmation). Confirm before executing.

**Files:**
- No new files. Regenerates: `app/src/lib/supabase/database.types.ts`.

- [ ] **Step 1: Get explicit go-ahead**

Ask the user to confirm before applying the migration to the shared Supabase project (`gptsklxbkuhdfkksmqhz`).

- [ ] **Step 2: Apply the migration**

Apply `app/supabase/migrations/0013_grant_type.sql` (from Task 4) to the project, using the same mechanism prior migrations in this repo used (Supabase CLI `supabase db push`, or the `apply_migration` MCP tool — check which one `0012` was applied with before choosing).

- [ ] **Step 3: Regenerate `database.types.ts`**

Regenerate `app/src/lib/supabase/database.types.ts` for project `gptsklxbkuhdfkksmqhz` (Supabase CLI `supabase gen types typescript` or the `generate_typescript_types` MCP tool). Confirm the `grants` table's `Row`/`Insert`/`Update` shapes now include `grant_type: string`.

- [ ] **Step 4: Full verification**

Run: `cd app && npx tsc --noEmit -p .`
Expected: PASS, zero errors (the `grant_type`-related errors deferred from Tasks 5 and 7 are now gone).

Run: `cd app && npm test && cd ../scraper && npm test && npm run typecheck`
Expected: PASS across both workspaces.

- [ ] **Step 5: Backfill production data**

Production currently has 3 grants (per the design doc, 2026-07-18); the migration's `default 'bando'` already sets all of them to `bando`. Re-run the scraper for `Regione Emilia-Romagna - Bandi Sociale (API)` (the source of the "Una giustizia più inclusiva" co-progettazione) so `enrich()` classifies it correctly on update. Confirm afterward:

```sql
select title, grant_type from grants order by created_at desc;
```

Expected: the "Una giustizia più inclusiva" row shows `grant_type = 'co_progettazione'`; the other two show `'bando'`.

- [ ] **Step 6: Commit the regenerated types file**

```bash
git add app/src/lib/supabase/database.types.ts
git commit -m "chore(db): regenerate database.types.ts for grant_type (migration 0013)"
```

---

## Plan Self-Review

**Spec coverage:**
- Classifier + precedence + ambiguous-case handling → Task 1. ✓
- Universal classification via `enrich()` → Task 2. ✓
- Insert-only skip gate for `amministrativo`, `grantType` excluded from diff `KEYS` → Task 3. ✓
- Persistence (migration, adapter, no CHECK constraint) → Task 4. ✓
- App `Grant.grantType`, mapping → Task 5. ✓
- Badge (co_progettazione only) on card + detail page → Task 6. ✓
- Additive list filter (`tipo=`) + FilterBar toggle → Task 7. ✓
- Backfill via re-scrape, verification query → Task 8. ✓
- Non-goals (no re-scoring, no default-hiding, no importo-based signal) — respected: no task touches `calculate-match.ts`'s scoring, the filter defaults to showing everything, and the classifier never reads `amount`.

**Placeholder scan:** No "TBD"/"add handling"/"similar to Task N" — every step has literal code or an exact command with expected output.

**Type consistency:** `GrantType` (scraper, 3 values) vs `GrantType` (app, 2 values) are deliberately distinct unions in distinct files, each documented inline as to why. `classifyGrantType(title, summary)` signature is identical everywhere it's referenced (Tasks 1-2). `Filters.grantTypes` / query key `tipo` used consistently across Tasks 7's `filters.ts` and `filter-bar.tsx`.
