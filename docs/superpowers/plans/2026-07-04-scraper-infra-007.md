# Scraper Infrastructure (branch 007) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new top-level `scraper/` package (independent of `app/`): the `LLMProvider` seam, the `PageFetcher` and `GrantsDb` seams, the 5-stage pipeline (fetch → extract → enrich → dedup → save) orchestrated by `runPipeline(sources, deps)`, plus a fake LLM provider and in-memory fakes — testable 100% offline, no network, no API keys.

**Architecture:** Everything the pipeline touches the outside world through is an injected dependency (`fetcher`, `llm`, `db`) — never constructed inside — so the whole pipeline runs against fakes in tests. Real adapters (Browserless fetcher, Gemini/Anthropic/… LLMs, the Supabase-backed `GrantsDb`) are deliberately deferred to branches 008/009; this branch builds only the seams + fakes + pure stages. The scraper is a **separate bounded context**: it does NOT import from `app/` and `app/` does NOT import from it, so it keeps its own copy of the matching vocabularies (47 tags, 62 legal types, 6 document keys) for validating AI output.

**Tech Stack:** Node 20, TypeScript strict, ESM, vitest, zod (for AI-output validation). No `@supabase/supabase-js` in this branch — the DB is an injected interface; the real Supabase adapter lands in 009.

## Global Constraints

- **Prompt/UI-facing strings: Italian. Code/comments: English.** (project CLAUDE.md)
- **Hard boundary:** no import from `app/` into `scraper/` or vice-versa. The scraper has its own `vocab.ts`. A CI-style grep in the final task enforces this.
- **Dependency injection:** `runPipeline` and every stage receive `fetcher`/`llm`/`db` as arguments; nothing constructs a real client, reads `process.env`, or opens a socket during tests.
- **Never crash on bad AI output:** `extractGrants` validates with zod and drops/nulls invalid fields (tags outside the 47 → dropped; legal types outside the 62 → dropped; non-ISO dates → null; malformed JSON → that grant skipped), returning a (possibly empty) array — it never throws.
- **Idempotency:** a second identical run writes nothing (0 inserted, all skipped). Dedup key = normalized URL.
- **Source isolation:** one source throwing must not abort the others; its error is recorded in that source's `PipelineResult.errors` and the run continues.
- **TS strict:** no `any` (use `unknown` + narrowing); all files typecheck under `--strict`.
- ExtractedGrant has the 16 fields, all nullable except `title` and `url` (arrays default to `[]`, never null).

## Reference: the 16 extracted fields (mirror of `grants` columns)

`title` (req), `url` (req), `providerId`, `deadline` (ISO), `status` (`aperto`/`chiuso`), `amount`, `cofundingRequired`, `eligibleTypes[]`, `tags[]`, `area`, `geoScope` (`comunale|provinciale|regionale|nazionale|europeo`), `complexity` (`bassa|media|alta`), `requiredDocuments[]` (subset of `statuto,bilancio,runts,rasd,durc,certificazioni`), `summary`, `requirements`, `beneficiaries`.

Vocabularies to copy verbatim into `scraper/src/pipeline/vocab.ts` (from `app/src/lib/matching/constants.ts`, read that file): `TAGS` (47 entries, lowercase), `LEGAL_TYPES` (62 entries). These are copied, not imported (bounded-context rule).

---

## File Structure

- `scraper/package.json`, `scraper/tsconfig.json`, `scraper/vitest.config.ts`, `scraper/env.example`, `scraper/.gitignore`
- `scraper/src/pipeline/vocab.ts` — copied TAGS/LEGAL_TYPES/DOCUMENT_KEYS/enum value sets.
- `scraper/src/providers/types.ts` — `LLMProvider`, `ProviderError`, `JsonSchema`.
- `scraper/src/providers/fake.ts` — deterministic fake LLM.
- `scraper/src/pipeline/types.ts` — `RawPage`, `ExtractedGrant`, `PipelineResult`, `SourceConfig`, `PageFetcher`, `GrantsDb`.
- `scraper/src/pipeline/extract-grants.ts` — prompt + JSON schema + zod validation + provider lookup.
- `scraper/src/pipeline/enrich.ts` — amount/geo normalization.
- `scraper/src/pipeline/dedup.ts` — URL normalization + partial-update diff.
- `scraper/src/pipeline/save.ts` — decide insert/update/skip via `GrantsDb`.
- `scraper/src/pipeline/run.ts` — `runPipeline(sources, deps)`.
- `scraper/tests/helpers/memory-db.ts`, `scraper/tests/helpers/fixtures.ts`
- `scraper/tests/*.test.ts`
- `docs/adr/0002-ai-provider-agnostic.md`

---

### Task 1: package scaffold + vocab

**Files:**
- Create: `scraper/package.json`, `scraper/tsconfig.json`, `scraper/vitest.config.ts`, `scraper/env.example`, `scraper/.gitignore`
- Create: `scraper/src/pipeline/vocab.ts`
- Test: `scraper/tests/vocab.test.ts`

- [ ] **Step 1: Create the package files**

`scraper/package.json`:
```json
{
  "name": "bandi-scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0"
  }
}
```

`scraper/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests"]
}
```

`scraper/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

`scraper/env.example`:
```
AI_PROVIDER=gemini
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`scraper/.gitignore`:
```
node_modules
dist
.env
```

- [ ] **Step 2: Install deps**

Run: `cd scraper && npm install`
Expected: creates `scraper/node_modules` + `scraper/package-lock.json`. (Network is available via the agent proxy; if install fails, report BLOCKED — do not fake it.)

- [ ] **Step 3: Create `vocab.ts` by copying from the app constants**

Read `app/src/lib/matching/constants.ts`. Copy the `TAGS` array (47 lowercase strings) and the `LEGAL_TYPES` array (62 strings) **verbatim** into `scraper/src/pipeline/vocab.ts`. Do NOT import from `app/` (bounded-context rule) — physically copy the string literals.

```ts
// scraper/src/pipeline/vocab.ts
// Copied verbatim from app/src/lib/matching/constants.ts. The scraper is a
// separate bounded context and must NOT import from app/, so these vocabularies
// are duplicated here on purpose. Keep in sync manually if the app's lists change.

export const TAGS = [ /* …47 lowercase strings copied verbatim… */ ] as const;
export const LEGAL_TYPES = [ /* …62 strings copied verbatim… */ ] as const;
export const DOCUMENT_KEYS = ["statuto", "bilancio", "runts", "rasd", "durc", "certificazioni"] as const;
export const GEO_SCOPES = ["comunale", "provinciale", "regionale", "nazionale", "europeo"] as const;
export const COMPLEXITY = ["bassa", "media", "alta"] as const;
export const GRANT_STATUS = ["aperto", "chiuso"] as const;

export const TAG_SET = new Set<string>(TAGS);
export const LEGAL_TYPE_SET = new Set<string>(LEGAL_TYPES);
export const DOCUMENT_KEY_SET = new Set<string>(DOCUMENT_KEYS);
export type GeoScope = (typeof GEO_SCOPES)[number];
export type Complexity = (typeof COMPLEXITY)[number];
export type GrantStatus = (typeof GRANT_STATUS)[number];
```

- [ ] **Step 4: Write `vocab.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { TAGS, LEGAL_TYPES, DOCUMENT_KEYS } from "../src/pipeline/vocab";

describe("vocab", () => {
  it("has 47 tags, all lowercase and unique", () => {
    expect(TAGS.length).toBe(47);
    expect(new Set(TAGS).size).toBe(47);
    for (const t of TAGS) expect(t).toBe(t.toLowerCase());
  });
  it("has 62 legal types, unique", () => {
    expect(LEGAL_TYPES.length).toBe(62);
    expect(new Set(LEGAL_TYPES).size).toBe(62);
  });
  it("has the 6 document keys", () => {
    expect(DOCUMENT_KEYS).toEqual(["statuto", "bilancio", "runts", "rasd", "durc", "certificazioni"]);
  });
});
```

- [ ] **Step 5: Run + typecheck + commit**

Run: `cd scraper && npm test && npm run typecheck`
Expected: PASS, tsc exit 0. (If a count is wrong, you mis-copied — fix the copy, not the test.)

```bash
cd /home/user/Bandi && git add scraper/package.json scraper/package-lock.json scraper/tsconfig.json scraper/vitest.config.ts scraper/env.example scraper/.gitignore scraper/src/pipeline/vocab.ts scraper/tests/vocab.test.ts
git commit -m "feat(scraper): package scaffold + copied vocab (47 tags, 62 types)"
```
(Do NOT commit `scraper/node_modules` — it's gitignored.)

---

### Task 2: seams + types + fakes

**Files:**
- Create: `scraper/src/providers/types.ts`, `scraper/src/providers/fake.ts`
- Create: `scraper/src/pipeline/types.ts`
- Create: `scraper/tests/helpers/memory-db.ts`
- Test: `scraper/tests/fake-provider.test.ts`

**Interfaces produced:**
- `LLMProvider`, `ProviderError`, `JsonSchema` (providers/types.ts)
- `RawPage`, `ExtractedGrant`, `PipelineResult`, `SourceConfig`, `PageFetcher`, `GrantsDb`, `StoredGrant` (pipeline/types.ts)
- `FakeLLMProvider` (providers/fake.ts), `InMemoryGrantsDb` (tests/helpers/memory-db.ts)

- [ ] **Step 1: `providers/types.ts`**

```ts
// scraper/src/providers/types.ts
export type JsonSchema = Record<string, unknown>;

export interface LLMProvider {
  readonly name: string;
  // Returns the model's raw structured output (unknown — the caller validates).
  extract(input: { html: string; schema: JsonSchema; instructions: string }): Promise<unknown>;
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ProviderError";
    this.retryable = opts?.retryable ?? false;
  }
}
```

- [ ] **Step 2: `pipeline/types.ts`**

```ts
// scraper/src/pipeline/types.ts
import type { GeoScope, Complexity, GrantStatus } from "./vocab";

export interface SourceConfig { id: string; name: string; url: string; }

export interface RawPage { sourceId: string; url: string; html: string; }

// The 16 extracted fields: all nullable except title/url; arrays default to [].
export interface ExtractedGrant {
  title: string;
  url: string;
  providerId: string | null;
  deadline: string | null;        // ISO date or null
  status: GrantStatus | null;
  amount: number | null;
  cofundingRequired: number | null;
  eligibleTypes: string[];        // validated subset of LEGAL_TYPES
  tags: string[];                 // validated subset of TAGS
  area: string | null;
  geoScope: GeoScope | null;
  complexity: Complexity | null;
  requiredDocuments: string[];    // subset of DOCUMENT_KEYS
  summary: string | null;
  requirements: string | null;
  beneficiaries: string | null;
}

export interface StoredGrant extends ExtractedGrant { id: string; }

export interface PipelineResult {
  sourceId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Seam 1: fetching (Browserless in prod → 009; fixtures in tests).
export interface PageFetcher { fetchPages(source: SourceConfig): Promise<RawPage[]>; }

// Seam 3: persistence (Supabase service_role adapter → 009; in-memory in tests).
export interface GrantsDb {
  findByUrl(normalizedUrl: string): Promise<StoredGrant | null>;
  insert(grant: ExtractedGrant): Promise<void>;
  update(id: string, patch: Partial<ExtractedGrant>): Promise<void>;
  findProviderIdByName(name: string): Promise<string | null>;
  updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void>;
}
```

- [ ] **Step 3: `providers/fake.ts`**

```ts
// scraper/src/providers/fake.ts
import type { LLMProvider } from "./types";
import { ProviderError } from "./types";

// Deterministic provider for tests: maps an input html string to a canned
// structured response. Unmapped html → throws (retryable) or returns [] per config.
export class FakeLLMProvider implements LLMProvider {
  readonly name = "fake";
  constructor(
    private readonly responses: Map<string, unknown>,
    private readonly onMissing: "empty" | "throw" = "empty",
  ) {}
  async extract(input: { html: string }): Promise<unknown> {
    if (this.responses.has(input.html)) return this.responses.get(input.html);
    if (this.onMissing === "throw") throw new ProviderError("no fixture for html", { retryable: true });
    return [];
  }
}
```

- [ ] **Step 4: `tests/helpers/memory-db.ts`**

```ts
// scraper/tests/helpers/memory-db.ts
import type { GrantsDb, StoredGrant, ExtractedGrant } from "../../src/pipeline/types";

export class InMemoryGrantsDb implements GrantsDb {
  grants: StoredGrant[] = [];
  sources: Record<string, { lastRunAt?: string; lastError?: string | null }> = {};
  providers: Record<string, string>; // name → id
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
}
```

- [ ] **Step 5: `tests/fake-provider.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FakeLLMProvider } from "../src/providers/fake";
import { ProviderError } from "../src/providers/types";

describe("FakeLLMProvider", () => {
  it("returns the canned response for known html", async () => {
    const p = new FakeLLMProvider(new Map([["<h1>x</h1>", [{ title: "T" }]]]));
    expect(await p.extract({ html: "<h1>x</h1>", schema: {}, instructions: "" })).toEqual([{ title: "T" }]);
  });
  it("returns [] for unknown html by default", async () => {
    const p = new FakeLLMProvider(new Map());
    expect(await p.extract({ html: "nope", schema: {}, instructions: "" })).toEqual([]);
  });
  it("throws a retryable ProviderError when configured to", async () => {
    const p = new FakeLLMProvider(new Map(), "throw");
    await expect(p.extract({ html: "nope", schema: {}, instructions: "" })).rejects.toBeInstanceOf(ProviderError);
  });
});
```

- [ ] **Step 6: Run + typecheck + commit**

Run: `cd scraper && npm test && npm run typecheck`
Expected: PASS, exit 0.

```bash
cd /home/user/Bandi && git add scraper/src/providers/types.ts scraper/src/providers/fake.ts scraper/src/pipeline/types.ts scraper/tests/helpers/memory-db.ts scraper/tests/fake-provider.test.ts
git commit -m "feat(scraper): LLMProvider/PageFetcher/GrantsDb seams + fakes"
```

---

### Task 3: extract-grants (prompt + zod validation + provider lookup)

**Files:**
- Create: `scraper/src/pipeline/extract-grants.ts`
- Test: `scraper/tests/extract-grants.test.ts`

**Interface:** `extractGrants(page: RawPage, deps: { llm: LLMProvider; db: GrantsDb }): Promise<ExtractedGrant[]>`. Builds the Italian instructions + a JSON schema of the 16 fields, calls `llm.extract`, then validates the raw output with zod: coerce each item to `ExtractedGrant`, **dropping** tags/types not in the vocab, nulling non-ISO dates, defaulting arrays to `[]`; items missing `title` or `url` are skipped; malformed/non-array output → `[]`. Resolve `providerId` via `db.findProviderIdByName(providerName)` (→ id or null). Never throws (catch provider/parse errors → return what validated, or `[]`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { extractGrants } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";

const page = (html: string): RawPage => ({ sourceId: "s1", url: "https://x/list", html });
function llmReturning(value: unknown, html = "H") {
  return new FakeLLMProvider(new Map<string, unknown>([[html, value]]));
}

describe("extractGrants", () => {
  it("drops tags outside the 47 and types outside the 62, keeps valid ones", async () => {
    const llm = llmReturning([{
      title: "Bando", url: "https://x/1",
      tags: ["sport", "inventato"], eligibleTypes: ["ONLUS", "TipoFinto"],
    }]);
    const [g] = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(g.tags).toEqual(["sport"]);
    expect(g.eligibleTypes).toEqual(["ONLUS"]);
  });

  it("nulls a non-ISO date and keeps a valid ISO date", async () => {
    const bad = llmReturning([{ title: "B", url: "https://x/1", deadline: "31 dicembre" }]);
    expect((await extractGrants(page("H"), { llm: bad, db: new InMemoryGrantsDb() }))[0].deadline).toBeNull();
    const good = llmReturning([{ title: "B", url: "https://x/2", deadline: "2026-12-31" }]);
    expect((await extractGrants(page("H"), { llm: good, db: new InMemoryGrantsDb() }))[0].deadline).toBe("2026-12-31");
  });

  it("skips items missing title or url", async () => {
    const llm = llmReturning([
      { url: "https://x/1" }, { title: "OK", url: "https://x/2" }, { title: "NoUrl" },
    ]);
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() });
    expect(out.map((g) => g.url)).toEqual(["https://x/2"]);
  });

  it("resolves providerId via db lookup by name (or null)", async () => {
    const llm = llmReturning([
      { title: "A", url: "https://x/1", providerName: "Fondazione Test" },
      { title: "B", url: "https://x/2", providerName: "Sconosciuto" },
    ]);
    const db = new InMemoryGrantsDb({ "Fondazione Test": "prov-123" });
    const out = await extractGrants(page("H"), { llm, db });
    expect(out[0].providerId).toBe("prov-123");
    expect(out[1].providerId).toBeNull();
  });

  it("never throws on malformed AI output (non-array, invalid json-ish)", async () => {
    for (const value of [null, "not-json", 42, { nope: true }]) {
      const out = await extractGrants(page("H"), { llm: llmReturning(value), db: new InMemoryGrantsDb() });
      expect(out).toEqual([]);
    }
  });

  it("returns [] (not a throw) when the provider itself errors", async () => {
    const throwing = new FakeLLMProvider(new Map(), "throw");
    const out = await extractGrants(page("H"), { llm: throwing, db: new InMemoryGrantsDb() });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scraper && npx vitest run tests/extract-grants.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `extract-grants.ts`**

```ts
// scraper/src/pipeline/extract-grants.ts
import { z } from "zod";
import type { LLMProvider, JsonSchema } from "../providers/types";
import type { ExtractedGrant, GrantsDb, RawPage } from "./types";
import { TAG_SET, LEGAL_TYPE_SET, DOCUMENT_KEY_SET, GEO_SCOPES, COMPLEXITY, GRANT_STATUS } from "./vocab";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The AI is asked for these keys; validation is lenient and never throws.
export const GRANT_JSON_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" }, url: { type: "string" }, providerName: { type: ["string", "null"] },
      deadline: { type: ["string", "null"] }, status: { type: ["string", "null"] },
      amount: { type: ["number", "string", "null"] }, cofundingRequired: { type: ["number", "string", "null"] },
      eligibleTypes: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      area: { type: ["string", "null"] }, geoScope: { type: ["string", "null"] },
      complexity: { type: ["string", "null"] },
      requiredDocuments: { type: "array", items: { type: "string" } },
      summary: { type: ["string", "null"] }, requirements: { type: ["string", "null"] },
      beneficiaries: { type: ["string", "null"] },
    },
    required: ["title", "url"],
  },
};

export const EXTRACT_INSTRUCTIONS = [
  "Sei un assistente che estrae bandi di finanziamento da una pagina web italiana.",
  "Restituisci un array JSON di bandi. Per ogni bando estrai i 16 campi dello schema.",
  "Usa null quando un campo non è presente. Le date devono essere in formato ISO (YYYY-MM-DD).",
  "Non inventare valori: se non sei sicuro, usa null o ometti l'elemento dell'array.",
].join(" ");

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null; // string amounts are normalized later in enrich
}

function coerce(raw: unknown, providerId: string | null): ExtractedGrant | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = stringOrNull(o.title);
  const url = stringOrNull(o.url);
  if (!title || !url) return null;

  const deadlineRaw = stringOrNull(o.deadline);
  const deadline = deadlineRaw && ISO_DATE.test(deadlineRaw) ? deadlineRaw : null;
  const statusRaw = stringOrNull(o.status);
  const status = statusRaw && (GRANT_STATUS as readonly string[]).includes(statusRaw)
    ? (statusRaw as ExtractedGrant["status"]) : null;
  const geoRaw = stringOrNull(o.geoScope);
  const geoScope = geoRaw && (GEO_SCOPES as readonly string[]).includes(geoRaw)
    ? (geoRaw as ExtractedGrant["geoScope"]) : null;
  const complexityRaw = stringOrNull(o.complexity);
  const complexity = complexityRaw && (COMPLEXITY as readonly string[]).includes(complexityRaw)
    ? (complexityRaw as ExtractedGrant["complexity"]) : null;

  return {
    title, url, providerId, deadline, status,
    amount: numOrNull(o.amount),
    cofundingRequired: numOrNull(o.cofundingRequired),
    eligibleTypes: stringArray(o.eligibleTypes).filter((t) => LEGAL_TYPE_SET.has(t)),
    tags: stringArray(o.tags).filter((t) => TAG_SET.has(t)),
    area: stringOrNull(o.area),
    geoScope, complexity,
    requiredDocuments: stringArray(o.requiredDocuments).filter((d) => DOCUMENT_KEY_SET.has(d)),
    summary: stringOrNull(o.summary),
    requirements: stringOrNull(o.requirements),
    beneficiaries: stringOrNull(o.beneficiaries),
  };
}

export async function extractGrants(
  page: RawPage, deps: { llm: LLMProvider; db: GrantsDb },
): Promise<ExtractedGrant[]> {
  let raw: unknown;
  try {
    raw = await deps.llm.extract({ html: page.html, schema: GRANT_JSON_SCHEMA, instructions: EXTRACT_INSTRUCTIONS });
  } catch {
    return []; // provider error → no grants from this page, pipeline continues
  }
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(raw)) return [];

  const out: ExtractedGrant[] = [];
  for (const item of raw) {
    const name = typeof item === "object" && item !== null
      ? stringOrNull((item as Record<string, unknown>).providerName) : null;
    const providerId = name ? await deps.db.findProviderIdByName(name) : null;
    const grant = coerce(item, providerId);
    if (grant) out.push(grant);
  }
  return out;
}
```

Note: `zod` is imported for parity with the package deps but the coercion above is hand-rolled for lenient, never-throw behavior; you may instead express `coerce` with a zod `.safeParse` + `.catch()` per field if cleaner — either is acceptable as long as every test passes and nothing throws. Keep whichever you implement consistent and typed (no `any`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd scraper && npx vitest run tests/extract-grants.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd scraper && npm run typecheck
cd /home/user/Bandi && git add scraper/src/pipeline/extract-grants.ts scraper/tests/extract-grants.test.ts
git commit -m "feat(scraper): extract-grants — lenient zod-style validation + provider lookup"
```

---

### Task 4: enrich (amount + geo normalization)

**Files:**
- Create: `scraper/src/pipeline/enrich.ts`
- Test: `scraper/tests/enrich.test.ts`

**Interface:** `enrich(grant: ExtractedGrant): ExtractedGrant` (pure). Normalizations: parse Italian amount strings if `amount`/`cofundingRequired` arrived as strings on the raw object (note: `extractGrants` already nulls string amounts, so `enrich` accepts an optional pre-parse path — keep it robust by exposing `parseItalianAmount(s)` and applying it); default `status` to `"aperto"` when null; infer `geoScope` from `area` when null (e.g. `"Italia"`→`nazionale`, a region name→`regionale`, `"Unione Europea"/"Europa"`→`europeo`). Keep it deterministic and documented.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { enrich, parseItalianAmount } from "../src/pipeline/enrich";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, deadline: null, status: null,
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null, ...over,
  };
}

describe("parseItalianAmount", () => {
  it("parses '1.000.000 €' → 1000000", () => expect(parseItalianAmount("1.000.000 €")).toBe(1000000));
  it("parses '50.000' → 50000", () => expect(parseItalianAmount("50.000")).toBe(50000));
  it("parses '€ 20.000,50' → 20000.5", () => expect(parseItalianAmount("€ 20.000,50")).toBe(20000.5));
  it("returns null for junk", () => expect(parseItalianAmount("boh")).toBeNull());
});

describe("enrich", () => {
  it("defaults status to aperto when null", () => {
    expect(enrich(g({ status: null })).status).toBe("aperto");
    expect(enrich(g({ status: "chiuso" })).status).toBe("chiuso");
  });
  it("infers geoScope from area when null", () => {
    expect(enrich(g({ area: "Italia" })).geoScope).toBe("nazionale");
    expect(enrich(g({ area: "Lombardia" })).geoScope).toBe("regionale");
    expect(enrich(g({ area: "Unione Europea" })).geoScope).toBe("europeo");
  });
  it("does not overwrite an existing geoScope", () => {
    expect(enrich(g({ area: "Italia", geoScope: "comunale" })).geoScope).toBe("comunale");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scraper && npx vitest run tests/enrich.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `enrich.ts`**

```ts
// scraper/src/pipeline/enrich.ts
import type { ExtractedGrant } from "./types";
import type { GeoScope } from "./vocab";

const REGIONS = new Set([
  "abruzzo","basilicata","calabria","campania","emilia-romagna","friuli-venezia giulia",
  "lazio","liguria","lombardia","marche","molise","piemonte","puglia","sardegna","sicilia",
  "toscana","trentino-alto adige","umbria","valle d'aosta","veneto",
]);

export function parseItalianAmount(raw: string): number | null {
  const cleaned = raw.replace(/[€\s]/g, "");
  if (cleaned === "" || !/[0-9]/.test(cleaned)) return null;
  // Italian format: '.' thousands, ',' decimals.
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function inferGeoScope(area: string): GeoScope | null {
  const a = area.trim().toLowerCase();
  if (a === "italia") return "nazionale";
  if (a === "unione europea" || a === "europa" || a === "ue") return "europeo";
  if (REGIONS.has(a)) return "regionale";
  return null;
}

export function enrich(grant: ExtractedGrant): ExtractedGrant {
  const status = grant.status ?? "aperto";
  let geoScope = grant.geoScope;
  if (geoScope == null && grant.area) geoScope = inferGeoScope(grant.area);
  return { ...grant, status, geoScope };
}

// exported for callers that receive raw string amounts before validation
export function normalizeAmountString(s: string | null): number | null {
  return s == null ? null : parseItalianAmount(s);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd scraper && npx vitest run tests/enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd scraper && npm run typecheck
cd /home/user/Bandi && git add scraper/src/pipeline/enrich.ts scraper/tests/enrich.test.ts
git commit -m "feat(scraper): enrich — italian amount parsing + geo_scope inference"
```

---

### Task 5: dedup (URL normalization + partial-update diff)

**Files:**
- Create: `scraper/src/pipeline/dedup.ts`
- Test: `scraper/tests/dedup.test.ts`

**Interface:**
- `normalizeUrl(url: string): string` — lowercase host, strip a trailing slash from the path, drop tracking query params (`utm_*`, `fbclid`, `gclid`, `ref`), drop the fragment, keep other query params sorted.
- `diffGrant(incoming: ExtractedGrant, existing: ExtractedGrant): Partial<ExtractedGrant>` — the subset of fields whose value changed (deep-equal for arrays). Empty object ⇒ nothing changed.
- `decide(incoming, existing): { action: "insert" } | { action: "skip" } | { action: "update"; patch: Partial<ExtractedGrant> }` — `existing == null` → insert; empty diff → skip; else update with the diff.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, diffGrant, decide } from "../src/pipeline/dedup";
import type { ExtractedGrant } from "../src/pipeline/types";

function g(over: Partial<ExtractedGrant>): ExtractedGrant {
  return {
    title: "T", url: "https://x/1", providerId: null, deadline: null, status: "aperto",
    amount: null, cofundingRequired: null, eligibleTypes: [], tags: [], area: null,
    geoScope: null, complexity: null, requiredDocuments: [], summary: null,
    requirements: null, beneficiaries: null, ...over,
  };
}

describe("normalizeUrl", () => {
  it("strips tracking params and trailing slash, lowercases host", () => {
    expect(normalizeUrl("https://Example.IT/bando/?utm_source=news&fbclid=1"))
      .toBe("https://example.it/bando");
  });
  it("keeps meaningful query params, sorted, and drops the fragment", () => {
    expect(normalizeUrl("https://x.it/a?b=2&a=1#frag")).toBe("https://x.it/a?a=1&b=2");
  });
  it("treats slash/no-slash and case-different host as the same key", () => {
    expect(normalizeUrl("https://X.it/p/")).toBe(normalizeUrl("https://x.it/p"));
  });
});

describe("diffGrant / decide", () => {
  it("empty diff when nothing changed → skip", () => {
    const a = g({ amount: 1000, tags: ["sport"] });
    expect(diffGrant(a, g({ amount: 1000, tags: ["sport"] }))).toEqual({});
    expect(decide(a, g({ amount: 1000, tags: ["sport"] }))).toEqual({ action: "skip" });
  });
  it("diff contains only the changed fields → update", () => {
    const incoming = g({ amount: 2000, tags: ["sport"] });
    const existing = g({ amount: 1000, tags: ["sport"] });
    expect(diffGrant(incoming, existing)).toEqual({ amount: 2000 });
    expect(decide(incoming, existing)).toEqual({ action: "update", patch: { amount: 2000 } });
  });
  it("insert when existing is null", () => {
    expect(decide(g({}), null)).toEqual({ action: "insert" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scraper && npx vitest run tests/dedup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `dedup.ts`**

```ts
// scraper/src/pipeline/dedup.ts
import type { ExtractedGrant } from "./types";

const TRACKING = /^(utm_.*|fbclid|gclid|ref)$/i;

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;
  return u.toString();
}

const KEYS: (keyof ExtractedGrant)[] = [
  "title", "url", "providerId", "deadline", "status", "amount", "cofundingRequired",
  "eligibleTypes", "tags", "area", "geoScope", "complexity", "requiredDocuments",
  "summary", "requirements", "beneficiaries",
];

function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}

export function diffGrant(incoming: ExtractedGrant, existing: ExtractedGrant): Partial<ExtractedGrant> {
  const patch: Partial<ExtractedGrant> = {};
  for (const k of KEYS) {
    if (!equal(incoming[k], existing[k])) {
      (patch as Record<string, unknown>)[k] = incoming[k];
    }
  }
  return patch;
}

export type Decision =
  | { action: "insert" } | { action: "skip" } | { action: "update"; patch: Partial<ExtractedGrant> };

export function decide(incoming: ExtractedGrant, existing: ExtractedGrant | null): Decision {
  if (existing == null) return { action: "insert" };
  const patch = diffGrant(incoming, existing);
  return Object.keys(patch).length === 0 ? { action: "skip" } : { action: "update", patch };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd scraper && npx vitest run tests/dedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd scraper && npm run typecheck
cd /home/user/Bandi && git add scraper/src/pipeline/dedup.ts scraper/tests/dedup.test.ts
git commit -m "feat(scraper): dedup — url normalization + partial-update diff"
```

---

### Task 6: save + run (orchestration) + e2e pipeline test

**Files:**
- Create: `scraper/src/pipeline/save.ts`, `scraper/src/pipeline/run.ts`
- Create: `scraper/tests/helpers/fixtures.ts` (fixture fetcher + sample HTML/responses)
- Test: `scraper/tests/pipeline.test.ts`

**Interfaces:**
- `saveGrant(grant: ExtractedGrant, db: GrantsDb): Promise<"inserted" | "updated" | "skipped">` — `db.findByUrl(normalizeUrl(grant.url))`, `decide`, then `db.insert`/`db.update`; stores the grant with its normalized url as the dedup key (normalize `grant.url` before insert so reruns match).
- `runPipeline(sources: SourceConfig[], deps: { fetcher: PageFetcher; llm: LLMProvider; db: GrantsDb }): Promise<PipelineResult[]>` — per source: fetch pages → extract → enrich → save, tallying inserted/updated/skipped; any thrown error for a source is caught, pushed to that source's `errors`, and the loop continues; finally `db.updateSource(source.id, { lastRunAt, lastError })`.

- [ ] **Step 1: `tests/helpers/fixtures.ts`**

```ts
import type { PageFetcher, RawPage, SourceConfig } from "../../src/pipeline/types";

export class FixtureFetcher implements PageFetcher {
  // map sourceId → pages
  constructor(private readonly pages: Record<string, RawPage[]>, private readonly failIds: Set<string> = new Set()) {}
  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    if (this.failIds.has(source.id)) throw new Error(`fetch failed for ${source.id}`);
    return this.pages[source.id] ?? [];
  }
}
```

- [ ] **Step 2: Implement `save.ts`**

```ts
// scraper/src/pipeline/save.ts
import type { ExtractedGrant, GrantsDb } from "./types";
import { normalizeUrl, decide } from "./dedup";

export async function saveGrant(
  grant: ExtractedGrant, db: GrantsDb,
): Promise<"inserted" | "updated" | "skipped"> {
  const normalized = normalizeUrl(grant.url);
  const toStore: ExtractedGrant = { ...grant, url: normalized };
  const existing = await db.findByUrl(normalized);
  const decision = decide(toStore, existing);
  if (decision.action === "insert") { await db.insert(toStore); return "inserted"; }
  if (decision.action === "update") { await db.update(existing!.id, decision.patch); return "updated"; }
  return "skipped";
}
```

- [ ] **Step 3: Implement `run.ts`**

```ts
// scraper/src/pipeline/run.ts
import type { LLMProvider } from "../providers/types";
import type { GrantsDb, PageFetcher, PipelineResult, SourceConfig } from "./types";
import { extractGrants } from "./extract-grants";
import { enrich } from "./enrich";
import { saveGrant } from "./save";

export async function runPipeline(
  sources: SourceConfig[],
  deps: { fetcher: PageFetcher; llm: LLMProvider; db: GrantsDb },
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const source of sources) {
    const result: PipelineResult = { sourceId: source.id, inserted: 0, updated: 0, skipped: 0, errors: [] };
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
    await deps.db.updateSource(source.id, {
      lastRunAt: new Date().toISOString(),
      lastError: result.errors.length ? result.errors.join("; ") : null,
    });
    results.push(result);
  }
  return results;
}
```

- [ ] **Step 4: Write `tests/pipeline.test.ts`** (e2e; idempotency; source isolation)

```ts
import { describe, it, expect } from "vitest";
import { runPipeline } from "../src/pipeline/run";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import { FixtureFetcher } from "./helpers/fixtures";
import type { RawPage, SourceConfig } from "../src/pipeline/types";

const sources: SourceConfig[] = [
  { id: "s1", name: "Fonte 1", url: "https://a/list" },
  { id: "s2", name: "Fonte 2", url: "https://b/list" },
];
const pageS1: RawPage = { sourceId: "s1", url: "https://a/list", html: "HTML_S1" };
const pageS2: RawPage = { sourceId: "s2", url: "https://b/list", html: "HTML_S2" };

function makeDeps(failIds = new Set<string>()) {
  const llm = new FakeLLMProvider(new Map<string, unknown>([
    ["HTML_S1", [
      { title: "Bando A", url: "https://a/bando-1", tags: ["sport"] },
      { title: "Bando B", url: "https://a/bando-2", amount: 50000 },
    ]],
    ["HTML_S2", [{ title: "Bando C", url: "https://b/bando-1" }]],
  ]));
  const fetcher = new FixtureFetcher({ s1: [pageS1], s2: [pageS2] }, failIds);
  const db = new InMemoryGrantsDb();
  return { llm, fetcher, db };
}

describe("runPipeline", () => {
  it("extracts, enriches, and inserts grants per source", async () => {
    const deps = makeDeps();
    const [r1, r2] = await runPipeline(sources, deps);
    expect(r1).toMatchObject({ sourceId: "s1", inserted: 2, updated: 0, skipped: 0, errors: [] });
    expect(r2).toMatchObject({ sourceId: "s2", inserted: 1, errors: [] });
    expect(deps.db.grants.length).toBe(3);
    expect(deps.db.sources["s1"].lastError).toBeNull();
  });

  it("is idempotent: a second identical run inserts nothing and skips all", async () => {
    const deps = makeDeps();
    await runPipeline(sources, deps);
    const second = await runPipeline(sources, deps);
    expect(second[0]).toMatchObject({ inserted: 0, skipped: 2 });
    expect(second[1]).toMatchObject({ inserted: 0, skipped: 1 });
    expect(deps.db.grants.length).toBe(3);
  });

  it("isolates a failing source: its error is recorded, others still complete", async () => {
    const deps = makeDeps(new Set(["s1"]));
    const [r1, r2] = await runPipeline(sources, deps);
    expect(r1.errors.length).toBe(1);
    expect(r1.inserted).toBe(0);
    expect(r2).toMatchObject({ sourceId: "s2", inserted: 1, errors: [] });
    expect(deps.db.sources["s1"].lastError).toContain("fetch failed");
  });

  it("updates only changed fields on a changed rerun", async () => {
    const deps = makeDeps();
    await runPipeline(sources, deps);
    // change Bando B's amount on the next run
    const llm2 = new FakeLLMProvider(new Map<string, unknown>([
      ["HTML_S1", [
        { title: "Bando A", url: "https://a/bando-1", tags: ["sport"] },
        { title: "Bando B", url: "https://a/bando-2", amount: 99999 },
      ]],
      ["HTML_S2", [{ title: "Bando C", url: "https://b/bando-1" }]],
    ]));
    const [r1] = await runPipeline(sources, { ...deps, llm: llm2 });
    expect(r1).toMatchObject({ updated: 1, skipped: 1 });
  });
});
```

- [ ] **Step 5: Run + typecheck + commit**

Run: `cd scraper && npm test && npm run typecheck`
Expected: all suites PASS, exit 0.

```bash
cd /home/user/Bandi && git add scraper/src/pipeline/save.ts scraper/src/pipeline/run.ts scraper/tests/helpers/fixtures.ts scraper/tests/pipeline.test.ts
git commit -m "feat(scraper): save + runPipeline orchestration (idempotent, source-isolated) + e2e test"
```

---

### Task 7: ADR-002 + boundary check + full verification

**Files:**
- Create: `docs/adr/0002-ai-provider-agnostic.md`

- [ ] **Step 1: Write `docs/adr/0002-ai-provider-agnostic.md`**

```markdown
# ADR-002 — AI provider-agnostic seam

## Status
Accepted (branch 007).

## Context
Grant extraction needs an LLM, but pricing, availability, and quality shift across
providers (Gemini free, Anthropic, Groq, OpenAI). Coupling the pipeline to one SDK
would make switching a rewrite.

## Decision
The scraper lives in a top-level `scraper/` package, separate from `app/`. The LLM sits
behind a minimal seam — `interface LLMProvider { name; extract({html, schema, instructions}) }`
— with interchangeable adapters selected by an env var (`AI_PROVIDER`). The interface is
deliberately minimal (one method); errors surface as `ProviderError` with a retry hint.
Fetching (`PageFetcher`) and persistence (`GrantsDb`) are seams too, so the whole pipeline
runs against fakes with no network or API keys.

## Consequences
- Switching providers = changing one env var + adding an adapter; the pipeline is untouched.
- The scraper is a separate bounded context: it does not import from `app/` and keeps its own
  copy of the matching vocabularies (47 tags, 62 legal types) for validating AI output.
- Real adapters (Browserless fetcher, provider SDKs, Supabase-backed GrantsDb) are wired in
  branches 008/009; branch 007 ships only seams, fakes, and the pure pipeline stages.
```

- [ ] **Step 2: Boundary check — no cross-imports**

Run: `cd /home/user/Bandi && grep -rn "from \"\.\./app\|from '.*/app/\|bandi-scraper\|scraper/src" app/src scraper/src || echo "OK: no cross-imports between app and scraper"`
Expected: prints the OK line (no matches). If any match appears, it's a boundary violation — report it.

- [ ] **Step 3: Full scraper verification**

Run: `cd scraper && npm test && npm run typecheck`
Expected: all tests PASS with no network/keys; tsc exit 0.

- [ ] **Step 4: Confirm the app is unaffected**

Run: `cd /home/user/Bandi/app && npx vitest run 2>&1 | tail -3`
Expected: app suite still passes (the scraper package is independent; app tests unchanged).

- [ ] **Step 5: Commit**

```bash
cd /home/user/Bandi && git add docs/adr/0002-ai-provider-agnostic.md
git commit -m "docs(scraper): ADR-002 ai-provider-agnostic seam"
```

---

## Self-Review

**1. Spec coverage (roadmap b007):**
- `scraper/package.json`/`tsconfig.json`/`vitest.config.ts` (independent, Node 20, TS strict) → Task 1 ✅
- `providers/types.ts` (LLMProvider seam + ProviderError, minimal interface, ADR-002) → Task 2 ✅
- `providers/fake.ts` (deterministic fixture provider) → Task 2 ✅
- `pipeline/types.ts` (RawPage, ExtractedGrant 16 fields nullable except title/url, PipelineResult) → Task 2 ✅
- `pipeline/fetch-page.ts` PageFetcher seam → folded into `pipeline/types.ts` (`PageFetcher`) + `FixtureFetcher` (Task 6 helper) ✅ (note: interface lives in types.ts rather than a separate fetch-page.ts — the real Browserless impl is 009)
- `pipeline/extract-grants.ts` (Italian prompt + JSON schema + zod validation: bad tags/types dropped, non-ISO dates null; provider lookup) → Task 3 ✅
- `pipeline/enrich.ts` (amount normalization, geo_scope inference) → Task 4 ✅
- `pipeline/dedup.ts` (normalized-URL key, partial update) → Task 5 ✅
- `pipeline/save.ts` (upsert via injected GrantsDb; real Supabase adapter deferred to 009) → Task 6 ✅
- `pipeline/run.ts` (`runPipeline(sources, deps)`, injected deps, source isolation, updates grant_sources) → Task 6 ✅
- `env.example` → Task 1 ✅; `docs/adr/0002` → Task 7 ✅
- Tests: `pipeline.test.ts` (e2e, idempotent rerun, source-failure isolation) → Task 6 ✅; `extract-grants.test.ts` (malformed output never crashes) → Task 3 ✅; `dedup.test.ts` (URL norm, partial update) → Task 5 ✅
- Acceptance: `cd scraper && npm test` offline + no keys (Tasks 1–7); idempotent (Task 6 test); no imports app↔scraper (Task 7 grep) ✅

**Deviation note (for the reviewer):** the roadmap lists a separate `pipeline/fetch-page.ts`; this plan puts the `PageFetcher` interface in `pipeline/types.ts` (with the fixture impl in the test helper) since the only concrete fetcher — Browserless — is branch 009. The `GrantsDb`/Supabase `save` via service_role is likewise an injected interface here, with the concrete adapter deferred to 009. Both are deliberate, documented, and keep 007 fully offline-testable. If the reviewer or human prefers a literal `fetch-page.ts`, it is a trivial move.

**2. Placeholder scan:** `vocab.ts` in Task 1 Step 3 shows `/* …copied verbatim… */` — Task 1 explicitly requires copying the real 47/62 strings from the named source file, and `vocab.test.ts` fails if the counts are wrong. The `void GEO_SCOPES;` line in enrich.ts is called out to be removed. No other placeholders reach shipped code.

**3. Type consistency:** `ExtractedGrant`/`GrantsDb`/`PageFetcher`/`LLMProvider` used consistently across extract/enrich/dedup/save/run and the fakes. `normalizeUrl` is the single dedup key used by both `saveGrant` (before store) and `db.findByUrl` (lookup) so reruns match. TS strict, no `any` (validation uses `unknown` + narrowing). The scraper imports nothing from `app/`.
