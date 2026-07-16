# ER Sociale via Plone API + DirectFetcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume the Regione Emilia-Romagna "Bandi Sociale" source through its official Plone `@search` REST API — plain HTTP fetch (no Chrome), code-only parsing for both listing and detail (zero LLM), PDF attachment metadata stored per grant.

**Architecture:** A new `DirectFetcher` (plain GET + `Accept: application/json`) sits beside `BrowserlessFetcher`; a `CompositeFetcher` dispatches per-source on `scrape_config.fetchMode`. A new `er-sociale` archetype parses the `@search` JSON in code (`parse`) and the per-grant JSON object in code via a new `parseDetail` seam on `Archetype`. Grants gain an `attachments` jsonb column for `{title, url, mimeType}` metadata.

**Tech Stack:** TypeScript (scraper package), vitest, Supabase (Postgres + MCP for DDL), Plone REST API.

**Spec:** `docs/superpowers/specs/2026-07-16-er-sociale-api-direct-fetch-design.md`

## Global Constraints

- NO writes to the production `grants` table; verification goes through the throwaway `grants_preview` staging table. Production runs and scheduler activation happen only on the user's explicit go.
- The `er-sociale` source must consume **zero** Gemini quota (code parsers on both phases).
- Existing sources must not change behavior: missing/unknown `fetchMode` → Browserless; archetypes without `parseDetail` → LLM detail as today.
- Code and comments in English; UI/docs in Italian. Conventional commits.
- Tests: `cd /workspaces/Bandi/scraper && npx vitest run <file>`; typecheck: `npm run typecheck`.
- Baseline before Task 1: 150 tests passing.

---

### Task 1: DirectFetcher

**Files:**
- Create: `scraper/src/pipeline/direct-fetcher.ts`
- Modify: `scraper/src/providers/http.ts:14-19` (make `HttpRequest.body` optional — a GET has none)
- Modify: `scraper/tests/helpers/http.ts:47-49` (`bodyOf` handles missing body)
- Test: `scraper/tests/direct-fetcher.test.ts`

**Interfaces:**
- Consumes: `PageFetcher`, `RawPage`, `SourceConfig` from `pipeline/types`; `defaultFetch`, `DEFAULT_TIMEOUT_MS`, `FetchLike` from `providers/http`; `withRetry`, `RetryOptions` from `providers/retry`; `ProviderError` from `providers/types`.
- Produces: `class DirectFetcher implements PageFetcher`, constructor `(config?: { fetchImpl?: FetchLike; timeoutMs?: number; retry?: RetryOptions })`. Task 2 and Task 7 instantiate it.

- [ ] **Step 1: Make `HttpRequest.body` optional**

In `scraper/src/providers/http.ts` change the interface:

```ts
export interface HttpRequest {
  method: string;
  headers: Record<string, string>;
  // Absent for GET requests (undici rejects a GET carrying a body, even an empty string).
  body?: string;
  signal?: unknown;
}
```

In `scraper/tests/helpers/http.ts` change `bodyOf`:

```ts
export function bodyOf(req: RecordedRequest): Record<string, unknown> {
  return JSON.parse(req.init.body ?? "null") as Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `scraper/tests/direct-fetcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DirectFetcher } from "../src/pipeline/direct-fetcher";
import { ProviderError } from "../src/providers/types";
import { mockFetch, mockResponse } from "./helpers/http";
import type { SourceConfig } from "../src/pipeline/types";

const source: SourceConfig = { id: "s1", name: "Fonte API", url: "https://esempio.it/pagina" };
const noWait = { retry: { sleep: async () => {} } };

describe("DirectFetcher", () => {
  it("GETs the url with a JSON-preferring Accept header, returning one RawPage", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, '{"items":[]}')]);
    const pages = await new DirectFetcher({ fetchImpl }).fetchPages(source);

    expect(requests[0]!.url).toBe("https://esempio.it/pagina");
    expect(requests[0]!.init.method).toBe("GET");
    expect(requests[0]!.init.headers.accept).toBe("application/json, text/html;q=0.9");
    expect(requests[0]!.init.body).toBeUndefined();
    expect(pages).toEqual([{ sourceId: "s1", url: "https://esempio.it/pagina", html: '{"items":[]}' }]);
  });

  it("prefers scrapeConfig.listUrl over the source url", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, "ok")]);
    const src: SourceConfig = { ...source, scrapeConfig: { listUrl: "https://esempio.it/@search?b_size=100" } };
    const pages = await new DirectFetcher({ fetchImpl }).fetchPages(src);
    expect(requests[0]!.url).toBe("https://esempio.it/@search?b_size=100");
    expect(pages[0]!.url).toBe("https://esempio.it/@search?b_size=100");
  });

  it("retries once on a 5xx then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(200, "ok")]);
    const pages = await new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source);
    expect(pages[0]!.html).toBe("ok");
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError after the retry is exhausted", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(503, {}), mockResponse(503, {})]);
    await expect(new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source))
      .rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(2);
  });

  it("does not retry a 4xx", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(404, "not found"), mockResponse(200, "ok")]);
    await expect(new DirectFetcher({ fetchImpl, ...noWait }).fetchPages(source))
      .rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/direct-fetcher.test.ts`
Expected: FAIL — cannot resolve `../src/pipeline/direct-fetcher`.

- [ ] **Step 4: Implement DirectFetcher**

Create `scraper/src/pipeline/direct-fetcher.ts`:

```ts
// scraper/src/pipeline/direct-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";
import { ProviderError } from "../providers/types";
import { defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike } from "../providers/http";
import { withRetry, type RetryOptions } from "../providers/retry";

export interface DirectFetcherConfig {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
}

// Plain HTTP fetcher for sources that are JSON APIs or static pages: no Chrome rendering, no
// Browserless quota, no external service in the path. The Accept header prefers JSON (Plone's
// @search answers 500 without it) while still accepting HTML for static pages. Selected
// per-source via scrape_config.fetchMode === "direct" (see CompositeFetcher).
export class DirectFetcher implements PageFetcher {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;

  constructor(config: DirectFetcherConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry;
  }

  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    const url = source.scrapeConfig?.listUrl ?? source.url;
    const body = await withRetry(
      async () => {
        let res;
        try {
          res = await this.fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json, text/html;q=0.9" },
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (cause) {
          throw new ProviderError("direct: errore di rete o timeout", { retryable: true, cause });
        }
        if (res.status === 429 || res.status >= 500) {
          throw new ProviderError(`direct: HTTP ${res.status}`, { retryable: true });
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new ProviderError(`direct: HTTP ${res.status} ${detail}`.trim(), { retryable: false });
        }
        return res.text();
      },
      { retries: 2, ...this.retry }, // 1 retry (2 attempts total), same policy as Browserless
    );
    return [{ sourceId: source.id, url, html: body }];
  }
}
```

- [ ] **Step 5: Run tests to verify they pass, plus the full suite**

Run: `npx vitest run tests/direct-fetcher.test.ts` → 5 PASS.
Run: `npx vitest run && npm run typecheck` → 155 pass, clean.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/pipeline/direct-fetcher.ts scraper/src/providers/http.ts scraper/tests/helpers/http.ts scraper/tests/direct-fetcher.test.ts
git commit -m "feat(scraper): DirectFetcher — plain HTTP fetch for API/static sources"
```

---

### Task 2: `fetchMode` in ScrapeConfig + CompositeFetcher

**Files:**
- Modify: `scraper/src/pipeline/types.ts:9-14` (ScrapeConfig)
- Create: `scraper/src/pipeline/composite-fetcher.ts`
- Test: `scraper/tests/composite-fetcher.test.ts`

**Interfaces:**
- Consumes: `PageFetcher` from `pipeline/types`.
- Produces: `ScrapeConfig.fetchMode?: string`; `class CompositeFetcher implements PageFetcher`, constructor `(browserless: PageFetcher, direct: PageFetcher)`. Task 7 wires it in run-production.

- [ ] **Step 1: Add `fetchMode` to ScrapeConfig**

In `scraper/src/pipeline/types.ts`, extend the interface and its doc comment:

```ts
// Per-source scraping hints stored in grant_sources.scrape_config (jsonb). All optional:
// listUrl overrides the source url for the listing page; maxPages caps pagination (MVP: 1);
// waitFor is passed to the fetcher (CSS selector or ms) to wait before capturing HTML;
// archetype selects the extraction strategy from the registry (default "full");
// fetchMode selects the fetch path: "direct" = plain HTTP (API/static sources, no Chrome),
// anything else/absent = Browserless rendering (the default).
export interface ScrapeConfig {
  listUrl?: string;
  maxPages?: number;
  waitFor?: string;
  archetype?: string;
  fetchMode?: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `scraper/tests/composite-fetcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CompositeFetcher } from "../src/pipeline/composite-fetcher";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";

class TaggedFetcher implements PageFetcher {
  calls: SourceConfig[] = [];
  constructor(private readonly tag: string) {}
  async fetchPages(source: SourceConfig): Promise<RawPage[]> {
    this.calls.push(source);
    return [{ sourceId: source.id, url: source.url, html: this.tag }];
  }
}

const src = (fetchMode?: string): SourceConfig => ({
  id: "s1", name: "Fonte", url: "https://x/list",
  ...(fetchMode ? { scrapeConfig: { fetchMode } } : {}),
});

describe("CompositeFetcher", () => {
  it("routes fetchMode 'direct' to the direct fetcher", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src("direct"));
    expect(pages[0]!.html).toBe("direct");
    expect(browserless.calls).toHaveLength(0);
  });

  it("defaults to browserless when fetchMode is absent", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src());
    expect(pages[0]!.html).toBe("browserless");
    expect(direct.calls).toHaveLength(0);
  });

  it("defaults to browserless on an unknown fetchMode value", async () => {
    const browserless = new TaggedFetcher("browserless");
    const direct = new TaggedFetcher("direct");
    const pages = await new CompositeFetcher(browserless, direct).fetchPages(src("typo"));
    expect(pages[0]!.html).toBe("browserless");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/composite-fetcher.test.ts`
Expected: FAIL — cannot resolve `../src/pipeline/composite-fetcher`.

- [ ] **Step 4: Implement CompositeFetcher**

Create `scraper/src/pipeline/composite-fetcher.ts`:

```ts
// scraper/src/pipeline/composite-fetcher.ts
import type { PageFetcher, RawPage, SourceConfig } from "./types";

// Per-source dispatch between the Chrome-rendering fetcher (default) and the plain HTTP one.
// The mode lives in grant_sources.scrape_config.fetchMode ("direct"); absent or unknown values
// keep today's behavior, so existing sources are untouched. Reading the mode per-call (not at
// construction) means the same instance serves the whole multi-source run, including the
// detail phase, exactly like the single fetcher it replaces in PipelineDeps.
export class CompositeFetcher implements PageFetcher {
  constructor(
    private readonly browserless: PageFetcher,
    private readonly direct: PageFetcher,
  ) {}

  fetchPages(source: SourceConfig): Promise<RawPage[]> {
    const fetcher = source.scrapeConfig?.fetchMode === "direct" ? this.direct : this.browserless;
    return fetcher.fetchPages(source);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass, plus the full suite**

Run: `npx vitest run tests/composite-fetcher.test.ts` → 3 PASS.
Run: `npx vitest run && npm run typecheck` → 158 pass, clean.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/pipeline/types.ts scraper/src/pipeline/composite-fetcher.ts scraper/tests/composite-fetcher.test.ts
git commit -m "feat(scraper): CompositeFetcher dispatching on scrape_config.fetchMode"
```

---

### Task 3: forward scrapeConfig (minus listUrl) to the detail-phase fetch

**Files:**
- Modify: `scraper/src/pipeline/run.ts:113-115`
- Test: `scraper/tests/pipeline.test.ts` (add one test)

**Interfaces:**
- Consumes: existing `runPipeline` internals.
- Produces: the detail-phase `fetchPages` call now receives `scrapeConfig` (without `listUrl`), so `CompositeFetcher` dispatch works in both phases. Task 6's end-to-end test relies on this.

- [ ] **Step 1: Write the failing test**

Add to `scraper/tests/pipeline.test.ts` (inside `describe("runPipeline")`; reuse existing imports — add `PageFetcher` to the type import from `../src/pipeline/types`):

```ts
  it("forwards scrapeConfig (minus listUrl) to the detail-phase fetch", async () => {
    // listUrl points at the LISTING endpoint: if it leaked into the detail-phase SourceConfig,
    // url-resolution inside the fetchers (scrapeConfig.listUrl ?? url) would re-fetch the
    // listing instead of the grant page. fetchMode instead MUST survive, or per-source
    // dispatch silently falls back to Browserless in the detail phase.
    const calls: SourceConfig[] = [];
    let n = 0;
    const recording: PageFetcher = {
      async fetchPages(s: SourceConfig): Promise<RawPage[]> {
        calls.push(s);
        n++;
        return [{ sourceId: s.id, url: s.scrapeConfig?.listUrl ?? s.url, html: n === 1 ? "HTML_S1" : "DETAIL" }];
      },
    };
    const src: SourceConfig = {
      id: "s1", name: "Fonte 1", url: "https://a/list",
      scrapeConfig: { fetchMode: "direct", listUrl: "https://a/api", maxPages: 1 },
    };
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      ["HTML_S1", [{ title: "Bando A", url: "https://a/bando-1" }]],
    ]));
    await runPipeline([src], { llm, fetcher: recording, db: new InMemoryGrantsDb(), detailThrottleMs: 0, sleep: noSleep });

    const detailCall = calls.find((c) => c.url === "https://a/bando-1");
    expect(detailCall).toBeDefined();
    expect(detailCall!.scrapeConfig?.fetchMode).toBe("direct");
    expect(detailCall!.scrapeConfig?.listUrl).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: the new test FAILS — `detailCall!.scrapeConfig` is `undefined` (run.ts builds `{id, name, url}` only).

- [ ] **Step 3: Implement the fix**

In `scraper/src/pipeline/run.ts`, replace the detail-phase fetch call (lines 113-115):

```ts
            // Forward the source's scrapeConfig so per-source fetch dispatch (fetchMode)
            // survives in the detail phase — but drop listUrl: it points at the LISTING
            // endpoint and would override the grant's own url inside the fetchers.
            const detailScrapeConfig = source.scrapeConfig ? { ...source.scrapeConfig } : undefined;
            if (detailScrapeConfig) delete detailScrapeConfig.listUrl;
            const pages = await deps.fetcher.fetchPages({
              id: source.id, name: source.name, url: grant.url,
              ...(detailScrapeConfig ? { scrapeConfig: detailScrapeConfig } : {}),
            });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pipeline.test.ts && npx vitest run && npm run typecheck` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/run.ts scraper/tests/pipeline.test.ts
git commit -m "fix(scraper): detail phase forwards scrapeConfig (minus listUrl) to the fetcher"
```

---

### Task 4: attachments plumbing (types, DB adapter, migration file)

**Files:**
- Modify: `scraper/src/pipeline/types.ts` (GrantAttachment; ExtractedGrant; DetailGrant)
- Modify: `scraper/src/pipeline/extract-detail.ts:93-110` (LLM path returns `attachments: []`)
- Modify: `scraper/src/pipeline/run.ts:122-137` (patch attachments)
- Modify: `scraper/src/db/supabase-grants-db.ts` (grantToInsertRow, COLUMN_OF, rowToStoredGrant)
- Create: `app/supabase/migrations/0012_grant_attachments_and_sources_overview.sql`
- Test: `scraper/tests/supabase-grants-db.test.ts` (add mapping assertions)

**Interfaces:**
- Produces: `interface GrantAttachment { title: string; url: string; mimeType: string | null }` exported from `pipeline/types`; `ExtractedGrant.attachments?: GrantAttachment[]`; `DetailGrant.attachments: GrantAttachment[]`. Task 6's `parseDetail` returns them; the DB writes them to the `attachments` jsonb column.

- [ ] **Step 1: Write the failing test**

Add to `scraper/tests/supabase-grants-db.test.ts` (top-level; it already imports `grantToInsertRow`/`patchToUpdateRow` — if not, extend the existing import from `../src/db/supabase-grants-db`):

```ts
  it("maps attachments to the jsonb column on insert and patch", () => {
    const attachments = [{ title: "Bando.pdf", url: "https://x/b.pdf", mimeType: "application/pdf" }];
    const row = grantToInsertRow({ ...baseGrant, attachments });
    expect(row.attachments).toEqual(attachments);
    // Grants without attachments write an empty array, never undefined/null.
    expect(grantToInsertRow(baseGrant).attachments).toEqual([]);
    expect(patchToUpdateRow({ attachments }).attachments).toEqual(attachments);
  });
```

(`baseGrant` = whatever complete `ExtractedGrant` fixture the file already uses; if it has none, reuse the `g()` builder shape from `scraper/tests/enrich.test.ts:5-15`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/supabase-grants-db.test.ts`
Expected: FAIL — TS error: `attachments` not in `ExtractedGrant`.

- [ ] **Step 3: Implement types + mappings**

In `scraper/src/pipeline/types.ts`, add above `ExtractedGrant`:

```ts
// Attachment metadata collected by code-based detail parsers (e.g. er-sociale via Plone API).
// Only metadata: binaries stay on the source site (Storage mirroring is a possible later step).
export interface GrantAttachment { title: string; url: string; mimeType: string | null; }
```

In `ExtractedGrant`, after `contactInfo`:

```ts
  // Optional: only code-based detail parsers populate it (LLM detail returns []).
  attachments?: GrantAttachment[];
```

In `DetailGrant`, after `tags`:

```ts
  attachments: GrantAttachment[];
```

In `scraper/src/pipeline/extract-detail.ts`, add to the returned object (after `tags`):

```ts
    // The LLM path never invents attachment URLs; only code parsers (parseDetail) supply them.
    attachments: [],
```

In `scraper/src/pipeline/run.ts`, in the patch-building block (after the `tags` line ~137):

```ts
            if (detail.attachments.length) patch.attachments = detail.attachments;
```

In `scraper/src/db/supabase-grants-db.ts`:
- `grantToInsertRow`: add `attachments: grant.attachments ?? [],`
- `COLUMN_OF`: add `attachments: "attachments",`
- `rowToStoredGrant`: add `attachments: (row.attachments as GrantAttachment[] | null) ?? [],` and import the type: `import type { ..., GrantAttachment } from "../pipeline/types";`

- [ ] **Step 4: Create the migration file**

Create `app/supabase/migrations/0012_grant_attachments_and_sources_overview.sql`:

```sql
-- 0012: attachment metadata + human-readable sources view
--
-- grants.attachments: array of {title, url, mimeType} collected by code-based detail parsers
-- (er-sociale reads them from the Plone API's "approfondimento"). Metadata only — binaries stay
-- on the source site; mirroring into Supabase Storage is a possible later step.
alter table grants add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Read-only lens over grant_sources unpacking scrape_config for the Table Editor: which
-- archetype parses each source and which fetch path it uses ("direct" = plain HTTP / API,
-- no Chrome). One source of truth (the jsonb) — this is a view, not a copy.
create or replace view sources_overview
with (security_invoker = true) as
select name,
       scrape_config->>'archetype' as archetype,
       scrape_config->>'fetchMode' as fetch_mode,
       enabled, priority, last_run_at, last_error
from grant_sources
order by name;
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run && npm run typecheck` → all pass (the migration file is not executed here; it is applied in Task 8).

- [ ] **Step 6: Commit**

```bash
git add scraper/src/pipeline/types.ts scraper/src/pipeline/extract-detail.ts scraper/src/pipeline/run.ts scraper/src/db/supabase-grants-db.ts scraper/tests/supabase-grants-db.test.ts app/supabase/migrations/0012_grant_attachments_and_sources_overview.sql
git commit -m "feat(scraper): grant attachments metadata (types, DB mapping, migration 0012)"
```

---

### Task 5: er-sociale archetype — listing parser + transcoding

**Files:**
- Create: `scraper/src/pipeline/er-sociale.ts`
- Modify: `scraper/src/pipeline/archetypes.ts:179-183` (registry)
- Modify: `scraper/tests/archetypes.test.ts:27` (registry list)
- Test: `scraper/tests/er-sociale.test.ts`

**Interfaces:**
- Consumes: `Archetype`, `DetailGrant`, `GrantAttachment` from `pipeline/types`; `TAG_SET`, `LEGAL_TYPE_SET` from `pipeline/vocab`; `parseItalianAmount` from `pipeline/enrich`; `JsonSchema` from `providers/types`.
- Produces: `ER_SOCIALE_ARCHETYPE: Archetype` (name `"er-sociale"`), `parseErSociale(raw: string): unknown[]`, plus (Task 6) `parseDetailErSociale(raw: string): DetailGrant | null`. Registered in `ARCHETYPES`.

- [ ] **Step 1: Write the failing tests**

Create `scraper/tests/er-sociale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveArchetype } from "../src/pipeline/archetypes";
import { parseErSociale } from "../src/pipeline/er-sociale";

// Minimal but shape-faithful @search response: metadata_fields flatten destinatari/materie to
// plain string arrays; non-Bando items (File/Link) appear when the filter is missing and must
// be skipped.
export const searchFixture = JSON.stringify({
  "@id": "https://sociale.example/@search",
  items_total: 2,
  items: [
    {
      "@id": "https://sociale.example/bandi/2025/bando-alimentare",
      "@type": "Bando",
      title: "Bando recupero alimentare 2025",
      description: "Con 1.000.000 euro di risorse per persone in condizione di povertà.",
      scadenza_bando: "2025-09-30T10:00:00+00:00",
      bando_state: ["inProgress", "In corso"],
      destinatari: ["Enti del Terzo settore"],
      materie: ["Diritti e sociale"],
    },
    {
      "@id": "https://sociale.example/bandi/2024/bando-adolescenza",
      "@type": "Bando",
      title: "Bando interventi per adolescenti",
      description: "600.000 euro per progetti rivolti a preadolescenti e adolescenti.",
      scadenza_bando: "2024-10-03T11:00:00+00:00",
      bando_state: ["closed", "Chiuso"],
      destinatari: ["Enti pubblici"],
      materie: ["Diritti e sociale"],
    },
    { "@id": "https://sociale.example/doc.pdf", "@type": "File", title: "un pdf" },
  ],
});

describe("er-sociale listing parser", () => {
  it("parses Bando items from the @search JSON, skipping other types", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Bando recupero alimentare 2025",
      url: "https://sociale.example/bandi/2025/bando-alimentare",
      deadline: "2025-09-30",
      status: "aperto",
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: "Enti del Terzo settore",
    });
    expect(items[1]).toMatchObject({ status: "chiuso", deadline: "2024-10-03" });
  });

  it("derives eligibleTypes with the broad ETS family (D.Lgs 117/2017)", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    const ets = items[0]!.eligibleTypes as string[];
    expect(ets).toContain("ETS - Ente del Terzo Settore");
    expect(ets).toContain("Cooperativa sociale tipo A");
    expect(ets).toContain("Fondazione ETS");
    expect(items[1]!.eligibleTypes).toEqual(["Ente pubblico"]);
  });

  it("derives tags from materie + keyword rules on title/description", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items[0]!.tags).toEqual(expect.arrayContaining(["welfare", "contrasto povertà"]));
    expect(items[1]!.tags).toEqual(expect.arrayContaining(["welfare", "giovani"]));
  });

  it("extracts a best-effort amount string from the description", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items[0]!.amount).toBe("1.000.000");
    expect(items[1]!.amount).toBe("600.000");
  });

  it("returns [] on malformed or unexpected JSON (LLM fallback contract)", () => {
    expect(parseErSociale("not json")).toEqual([]);
    expect(parseErSociale('{"no":"items"}')).toEqual([]);
  });

  it("is registered with fetch-friendly settings", () => {
    const a = resolveArchetype("er-sociale");
    expect(a.name).toBe("er-sociale");
    expect(a.urlSnapping).toBe(false);
    expect(a.detailEnabled).toBe(true);
    expect(a.sanitize("{\"x\":1}")).toBe("{\"x\":1}"); // identity: JSON must not be HTML-sanitized
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/er-sociale.test.ts`
Expected: FAIL — cannot resolve `../src/pipeline/er-sociale`.

- [ ] **Step 3: Implement the listing half of er-sociale.ts**

Create `scraper/src/pipeline/er-sociale.ts`:

```ts
// scraper/src/pipeline/er-sociale.ts
// Archetype "er-sociale": Regione Emilia-Romagna "Sociale" bandi via the official Plone REST
// API. The human listing page is a ~12MB Volto app the LLM extracts almost nothing from; the
// @search endpoint (scrape_config.listUrl, fetched with fetchMode "direct") returns every Bando
// as clean JSON, and each grant's own URL returns the full object (detail phase) — so this
// archetype calls the LLM in neither phase. Design:
// docs/superpowers/specs/2026-07-16-er-sociale-api-direct-fetch-design.md
import type { Archetype, DetailGrant, GrantAttachment } from "./types";
import type { JsonSchema } from "../providers/types";
import { TAG_SET, LEGAL_TYPE_SET } from "./vocab";
import { parseItalianAmount } from "./enrich";

// "2025-09-30T10:00:00+00:00" (or TZ-less "2025-08-01T08:00:00") → "2025-09-30"; else null.
function isoDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
}

// destinatari/materie come as ["Enti del Terzo settore"] in @search metadata but as
// [{title, token}] in the full detail object — normalize both to plain strings.
function tokens(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (typeof e === "string" ? e : (e as { title?: unknown } | null)?.title))
    .filter((t): t is string => typeof t === "string" && t.trim() !== "");
}

// D.Lgs 117/2017: cooperative sociali, imprese sociali and fondazioni ETS ARE third-sector
// entities, so "Enti del Terzo settore" maps to the full ETS family — the narrow TERZO_SETT
// group would wrongly exclude a coop sociale from a grant open to every ETS.
const ETS_TYPES: readonly string[] = [
  "APS - Associazione di Promozione Sociale", "ODV - Organizzazione di Volontariato",
  "ETS - Ente del Terzo Settore", "Rete associativa ETS", "ONLUS", "ONG / OSC",
  "Cooperativa sociale tipo A", "Cooperativa sociale tipo B", "Consorzio di cooperative sociali",
  "Impresa sociale", "Fondazione ETS", "Società di mutuo soccorso", "Ente filantropico",
];

// "Cittadini" / "Soggetti accreditati" have no LEGAL_TYPES equivalent (individuals / too vague)
// and are deliberately unmapped: absence of a rule means no invented restriction.
const DESTINATARI_TYPES: Record<string, readonly string[]> = {
  "enti del terzo settore": ETS_TYPES,
  "enti pubblici": ["Ente pubblico"],
  "partenariato pubblico/privato": ["Raggruppamento temporaneo / ATS"],
};

function deriveEligibleTypes(destinatari: string[]): string[] {
  const out = new Set<string>();
  for (const d of destinatari) {
    for (const t of DESTINATARI_TYPES[d.trim().toLowerCase()] ?? []) out.add(t);
  }
  return [...out].filter((t) => LEGAL_TYPE_SET.has(t));
}

const MATERIE_TAGS: Record<string, string> = {
  // Blanket tag: the whole section is the region's social-policy area (the analogue of the
  // always-on "sport" in the sportesalute archetype).
  "diritti e sociale": "welfare",
  "ambiente": "ambiente",
  "cultura": "cultura",
  "sport": "sport",
};

const TEXT_TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /povert/i, tag: "contrasto povertà" },
  { re: /adolescen|giovani/i, tag: "giovani" },
  { re: /infanzia|minori/i, tag: "minori" },
  { re: /disabil/i, tag: "disabilità" },
  { re: /anzian/i, tag: "anziani" },
  { re: /volontariat/i, tag: "volontariato" },
  { re: /famigli/i, tag: "famiglie" },
  { re: /inclusion/i, tag: "inclusione" },
];

function deriveTags(materie: string[], text: string): string[] {
  const out = new Set<string>();
  for (const m of materie) {
    const tag = MATERIE_TAGS[m.trim().toLowerCase()];
    if (tag) out.add(tag);
  }
  for (const rule of TEXT_TAG_RULES) if (rule.re.test(text)) out.add(rule.tag);
  return [...out].filter((t) => TAG_SET.has(t));
}

// Best-effort amount from free text ("Con 1.000.000 euro di risorse…"): kept as the raw numeric
// string — coerce's numOrNull parses it via parseItalianAmount downstream.
function amountFrom(text: string): string | null {
  return /([\d][\d.,]*)\s*(?:euro|€)/i.exec(text)?.[1] ?? null;
}

// bando_state is ["inProgress","In corso"] / ["open","Attivo"] / ["closed","Chiuso"].
function statusFrom(v: unknown): "aperto" | "chiuso" | null {
  const token = Array.isArray(v) ? v[0] : null;
  if (token === "inProgress" || token === "open") return "aperto";
  if (token === "closed") return "chiuso";
  return null;
}

// PRIMARY listing path: parse the @search JSON straight into raw grant items — no LLM.
// Returns [] on anything unexpected, which makes extractGrants fall back to the LLM.
export function parseErSociale(raw: string): unknown[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const items = (data as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: unknown[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (o["@type"] !== "Bando") continue;
    const title = typeof o.title === "string" ? o.title : null;
    const url = typeof o["@id"] === "string" ? o["@id"] : null;
    if (!title || !url) continue;
    const description = typeof o.description === "string" ? o.description : "";
    const destinatari = tokens(o.destinatari);
    out.push({
      title,
      url,
      summary: description || null,
      deadline: isoDay(o.scadenza_bando),
      status: statusFrom(o.bando_state),
      amount: amountFrom(description),
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: destinatari.join(", ") || null,
      eligibleTypes: deriveEligibleTypes(destinatari),
      tags: deriveTags(tokens(o.materie), `${title} ${description}`),
    });
  }
  return out;
}

// LLM fallback (used only if parse() returns [], e.g. the API shape changed): the body is the
// raw @search JSON, so the instructions explain that shape instead of an HTML page.
const ER_SOCIALE_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
      summary: { type: "string", nullable: true },
      beneficiaries: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const ER_SOCIALE_INSTRUCTIONS = [
  "Il contenuto è la risposta JSON dell'API Plone @search di un sito regionale: un oggetto con un array 'items' i cui elementi con '@type' = 'Bando' sono bandi.",
  "Per ogni bando estrai: title, url (il campo '@id', copialo ESATTO), deadline (da 'scadenza_bando', solo la data YYYY-MM-DD), summary (da 'description'), beneficiaries (da 'destinatari').",
  "Ignora gli elementi con '@type' diverso da 'Bando'. Usa null per i campi mancanti. Non inventare valori.",
].join(" ");

export const ER_SOCIALE_ARCHETYPE: Archetype = {
  name: "er-sociale",
  parse: parseErSociale,             // primary path — no LLM
  sanitize: (html) => html,          // the body is JSON, not HTML — nothing to sanitize
  chunkSize: 35_000,
  overlap: 2_000,
  boundaryTags: [],                  // no HTML boundaries in JSON; whitespace fallback is fine
  urlSnapping: false,                // @id values are canonical; no hrefs exist to snap to
  listing: { schema: ER_SOCIALE_SCHEMA, instructions: ER_SOCIALE_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: true,               // each grant's URL returns the full object incl. attachments
};
```

Register it in `scraper/src/pipeline/archetypes.ts` — add the import at the top and the entry:

```ts
import { ER_SOCIALE_ARCHETYPE } from "./er-sociale";
```

```ts
export const ARCHETYPES: Record<string, Archetype> = {
  [FULL_ARCHETYPE.name]: FULL_ARCHETYPE,
  [LISTING_LIGHT_ARCHETYPE.name]: LISTING_LIGHT_ARCHETYPE,
  [SPORTESALUTE_ARCHETYPE.name]: SPORTESALUTE_ARCHETYPE,
  [ER_SOCIALE_ARCHETYPE.name]: ER_SOCIALE_ARCHETYPE,
};
```

Update the registry test in `scraper/tests/archetypes.test.ts:27`:

```ts
    expect(Object.keys(ARCHETYPES).sort()).toEqual(["er-sociale", "full", "listing-light", "sportesalute"]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/er-sociale.test.ts tests/archetypes.test.ts && npm run typecheck` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/pipeline/er-sociale.ts scraper/src/pipeline/archetypes.ts scraper/tests/er-sociale.test.ts scraper/tests/archetypes.test.ts
git commit -m "feat(scraper): er-sociale archetype — code parser for the Plone @search listing"
```

---

### Task 6: parseDetail seam + er-sociale detail parser + end-to-end

**Files:**
- Modify: `scraper/src/pipeline/types.ts` (Archetype gains `parseDetail?`)
- Modify: `scraper/src/pipeline/run.ts:119` (branch on parseDetail)
- Modify: `scraper/src/pipeline/er-sociale.ts` (add detail half)
- Test: `scraper/tests/er-sociale.test.ts` (extend)

**Interfaces:**
- Produces: `Archetype.parseDetail?: (html: string) => DetailGrant | null`; `parseDetailErSociale(raw: string): DetailGrant | null` exported from `er-sociale.ts`; `ER_SOCIALE_ARCHETYPE.parseDetail` set.

- [ ] **Step 1: Write the failing tests**

Append to `scraper/tests/er-sociale.test.ts` (extend the imports at the top):

```ts
import { parseDetailErSociale } from "../src/pipeline/er-sociale";
import { runPipeline } from "../src/pipeline/run";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";
import type { LLMProvider } from "../src/providers/types";
```

```ts
// The full Bando object (detail GET on the grant's own URL): destinatari/materie become
// {title, token} objects, rich text is Volto "slate" blocks, attachments live in
// approfondimento[].children[].
export const detailFixture = JSON.stringify({
  "@id": "https://sociale.example/bandi/2025/bando-alimentare",
  "@type": "Bando",
  title: "Bando recupero alimentare 2025",
  description: "Con 1.000.000 euro di risorse.",
  apertura_bando: "2025-08-01T08:00:00",
  scadenza_bando: "2025-09-30T10:00:00+00:00",
  bando_state: ["inProgress", "In corso"],
  destinatari: [{ title: "Enti del Terzo settore", token: "Enti del Terzo settore" }],
  materie: [{ title: "Diritti e sociale", token: "Diritti e sociale" }],
  riferimenti: {
    blocks: { a: { "@type": "slate", plaintext: "Viviana Bussadori viviana@regione.example" } },
    blocks_layout: { items: ["a"] },
  },
  text: {
    blocks: { b: { "@type": "slate", plaintext: "Le spese ammissibili sono quelle direttamente imputabili." } },
    blocks_layout: { items: ["b"] },
  },
  approfondimento: [{
    children: [
      { title: "Bando definitivo.pdf", url: "https://sociale.example/allegato.pdf", mime_type: "application/pdf" },
      { title: "senza url" },
    ],
  }],
});

describe("er-sociale detail parser", () => {
  it("maps the full Bando object to a DetailGrant without any LLM", () => {
    const d = parseDetailErSociale(detailFixture)!;
    expect(d.openingDate).toBe("2025-08-01");
    expect(d.deadline).toBe("2025-09-30");
    expect(d.contactInfo).toContain("Bussadori");
    expect(d.requirements).toContain("spese ammissibili");
    expect(d.summary).toContain("1.000.000 euro");
    expect(d.amount).toBe(1000000);
    expect(d.beneficiaries).toBe("Enti del Terzo settore");
    expect(d.eligibleTypes).toContain("Cooperativa sociale tipo B");
    expect(d.tags).toContain("welfare");
    // Children without a url are dropped, never half-mapped.
    expect(d.attachments).toEqual([
      { title: "Bando definitivo.pdf", url: "https://sociale.example/allegato.pdf", mimeType: "application/pdf" },
    ]);
  });

  it("returns null on malformed JSON or a non-Bando object", () => {
    expect(parseDetailErSociale("boh")).toBeNull();
    expect(parseDetailErSociale('{"@type":"Document"}')).toBeNull();
  });
});

describe("er-sociale end-to-end (listing + detail, LLM never called)", () => {
  it("inserts grants from @search and patches detail from each grant's JSON", async () => {
    const src: SourceConfig = {
      id: "er", name: "ER (API)", url: "https://sociale.example/bandi",
      scrapeConfig: { archetype: "er-sociale", fetchMode: "direct", listUrl: "https://sociale.example/@search" },
    };
    let call = 0;
    const fetcher: PageFetcher = {
      async fetchPages(s: SourceConfig): Promise<RawPage[]> {
        call++;
        return [{ sourceId: s.id, url: s.url, html: call === 1 ? searchFixture : detailFixture }];
      },
    };
    const llm: LLMProvider = {
      name: "boom",
      extract: async () => { throw new Error("LLM must not be called for er-sociale"); },
    };
    const db = new InMemoryGrantsDb();
    const [result] = await runPipeline([src], { llm, fetcher, db, detailThrottleMs: 0, sleep: async () => {} });

    expect(result!.errors).toEqual([]);
    expect(result!.detailErrors).toEqual([]);
    expect(db.grants).toHaveLength(2);
    const g = db.grants.find((x) => x.url.includes("bando-alimentare"))!;
    expect(g.openingDate).toBe("2025-08-01");
    expect(g.contactInfo).toContain("Bussadori");
    expect(g.attachments?.[0]?.url).toBe("https://sociale.example/allegato.pdf");
    expect(db.scrapeLogs.some((l) => l.phase === "detail" && l.updated === 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/er-sociale.test.ts`
Expected: FAIL — `parseDetailErSociale` is not exported.

- [ ] **Step 3: Add the seam to Archetype and run.ts**

In `scraper/src/pipeline/types.ts`, inside `Archetype` after `parse?`:

```ts
  // Optional deterministic code parser for the DETAIL page (same spirit as parse for the
  // listing): given the raw body of a grant's own page, returns the DetailGrant or null.
  // When present, the detail phase never calls the LLM for this archetype.
  parseDetail?: (html: string) => DetailGrant | null;
```

(`types.ts` already declares `DetailGrant` below `Archetype` — TypeScript interfaces hoist, no reorder needed.)

In `scraper/src/pipeline/run.ts:119`, replace:

```ts
            const detail = await extractDetail(page.html, deps.llm);
```

with:

```ts
            // Code-based detail parser when the archetype provides one (API sources); LLM
            // extraction otherwise — existing sources keep today's behavior.
            const detail = archetype.parseDetail
              ? archetype.parseDetail(page.html)
              : await extractDetail(page.html, deps.llm);
```

- [ ] **Step 4: Add the detail half to er-sociale.ts**

Append to `scraper/src/pipeline/er-sociale.ts` (before `ER_SOCIALE_ARCHETYPE`) and add `parseDetail: parseDetailErSociale,` to the archetype object right under `parse`:

```ts
const REQUIREMENTS_MAX_CHARS = 5_000;

// Volto rich text ("slate"): { blocks: {id: {plaintext}}, blocks_layout: {items: [ordered ids]} }.
function slateText(v: unknown): string | null {
  const o = v as {
    blocks?: Record<string, { plaintext?: string } | undefined>;
    blocks_layout?: { items?: string[] };
  } | null;
  if (!o?.blocks) return null;
  const order = o.blocks_layout?.items ?? Object.keys(o.blocks);
  const text = order.map((k) => o.blocks?.[k]?.plaintext ?? "").filter(Boolean).join("\n").trim();
  return text || null;
}

// approfondimento: [{children: [{title, url, mime_type, …}]}] — the grant's PDF attachments.
// Metadata only; children missing title or url are dropped, never half-mapped.
function attachmentsFrom(o: Record<string, unknown>): GrantAttachment[] {
  const out: GrantAttachment[] = [];
  if (!Array.isArray(o.approfondimento)) return out;
  for (const section of o.approfondimento) {
    const children = (section as { children?: unknown[] } | null)?.children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      const c = child as Record<string, unknown>;
      if (typeof c.url !== "string" || typeof c.title !== "string") continue;
      out.push({ title: c.title, url: c.url, mimeType: typeof c.mime_type === "string" ? c.mime_type : null });
    }
  }
  return out;
}

// DETAIL path: map the grant's own API object to a DetailGrant — no LLM. Returns null on
// anything unexpected, which the pipeline counts as detailSkipped (retried next run).
export function parseDetailErSociale(raw: string): DetailGrant | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  if (o["@type"] !== "Bando") return null;

  const title = typeof o.title === "string" ? o.title : "";
  const description = typeof o.description === "string" ? o.description : "";
  const destinatari = tokens(o.destinatari);
  const text = slateText(o.text);
  const amountRaw = amountFrom(`${description} ${text ?? ""}`);

  return {
    summary: description || null,
    requirements: text ? text.slice(0, REQUIREMENTS_MAX_CHARS) : null,
    beneficiaries: destinatari.join(", ") || null,
    openingDate: isoDay(o.apertura_bando),
    fundingType: null,
    amount: amountRaw ? parseItalianAmount(amountRaw) : null,
    minAmount: null,
    maxAmount: null,
    cofundingPercentage: null,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: slateText(o.riferimenti),
    deadline: isoDay(o.scadenza_bando),
    eligibleTypes: deriveEligibleTypes(destinatari),
    tags: deriveTags(tokens(o.materie), `${title} ${description}`),
    attachments: attachmentsFrom(o),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass, plus the full suite**

Run: `npx vitest run tests/er-sociale.test.ts && npx vitest run && npm run typecheck` → all pass.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/pipeline/types.ts scraper/src/pipeline/run.ts scraper/src/pipeline/er-sociale.ts scraper/tests/er-sociale.test.ts
git commit -m "feat(scraper): parseDetail seam + er-sociale detail via the grant's own API JSON"
```

---

### Task 7: wire CompositeFetcher into production

**Files:**
- Modify: `scraper/src/run-production.ts:6,78`

**Interfaces:**
- Consumes: `CompositeFetcher`, `DirectFetcher`, `BrowserlessFetcher`.
- Produces: production runs (CLI, cron route) dispatch per-source automatically.

- [ ] **Step 1: Swap the fetcher construction**

In `scraper/src/run-production.ts`, extend the imports:

```ts
import { BrowserlessFetcher } from "./pipeline/browserless-fetcher";
import { DirectFetcher } from "./pipeline/direct-fetcher";
import { CompositeFetcher } from "./pipeline/composite-fetcher";
```

and replace line 78:

```ts
  // Per-source dispatch: scrape_config.fetchMode "direct" → plain HTTP (API/static sources),
  // default → Browserless. One instance serves the whole run, listing and detail phases alike.
  const fetcher = new CompositeFetcher(
    new BrowserlessFetcher({ apiKey: env.BROWSERLESS_API_KEY!, baseUrl: env.BROWSERLESS_URL }),
    new DirectFetcher(),
  );
```

- [ ] **Step 2: Full suite + typecheck**

Run: `npx vitest run && npm run typecheck` → all pass (run-production has no dedicated test; the pieces are covered by Tasks 1-6).

- [ ] **Step 3: Commit**

```bash
git add scraper/src/run-production.ts
git commit -m "feat(scraper): production fetcher is now CompositeFetcher (browserless + direct)"
```

---

### Task 8: DB config + preview verification (CHECKPOINT — no production grants writes)

**Files/Systems:** Supabase (MCP `apply_migration` + `execute_sql`), scratchpad preview script, `grants_preview`.

**Interfaces:** consumes everything above; produces rows in `grants_preview` for the user to inspect.

- [ ] **Step 1: Apply migration 0012** via MCP `apply_migration` with the exact content of `app/supabase/migrations/0012_grant_attachments_and_sources_overview.sql` (additive: new column with default + view; no data touched).

- [ ] **Step 2: Align grants_preview** (throwaway staging table) via `execute_sql`:

```sql
ALTER TABLE grants_preview
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS contact_info text,
  ADD COLUMN IF NOT EXISTS attachments jsonb;
```

- [ ] **Step 3: Update the source config** (inert until a run happens — scheduler is paused, Vercel scrape cron removed):

```sql
UPDATE grant_sources SET
  name = 'Regione Emilia-Romagna - Bandi Sociale (API)',
  scrape_config = '{"archetype":"er-sociale","fetchMode":"direct","maxPages":1,"listUrl":"https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi/@search?portal_type=Bando&metadata_fields=scadenza_bando&metadata_fields=destinatari&metadata_fields=materie&metadata_fields=bando_state&metadata_fields=tipologia_bando&b_size=100"}'::jsonb
WHERE id = '2cd00bc8-058e-4909-94d8-c7d04934a869';
```

Verify with: `SELECT * FROM sources_overview;` (also confirms the view works).

- [ ] **Step 4: Preview script** in the scratchpad (`preview-er.mjs`, run with `node --import tsx`): fetch the listUrl with `accept: application/json`, run `extractGrants` with `resolveArchetype("er-sociale")`, a throwing stub LLM and a null-provider db stub, map through `enrich`; ALSO fetch 3 individual grants and run `parseDetailErSociale` on them, merging `summary/opening_date/contact_info/attachments` into those rows. TRUNCATE `grants_preview`, bulk-insert via REST POST (same flow as the SES preview: `Prefer: return=minimal`, service key from `scraper/.env`, never printed).

- [ ] **Step 5: Verify and report** via `execute_sql`:

```sql
SELECT count(*) AS totale,
       count(*) FILTER (WHERE status = 'aperto') AS aperti,
       count(*) FILTER (WHERE array_length(eligible_types,1) > 0) AS con_eligible_types,
       count(*) FILTER (WHERE amount IS NOT NULL) AS con_importo,
       count(*) FILTER (WHERE attachments IS NOT NULL) AS con_allegati
FROM grants_preview;
```

Plus 5 sample rows. Report the numbers to the user; production run and scheduler activation remain gated on their explicit go. Note for that future step: the 5 old LLM-scraped ER grants in `grants` may have different URLs than the API's `@id` values — decide dedup/cleanup then.

- [ ] **Step 6: Final commit of any remaining files and push** (`git push` on main after the suite is green).

---

## Self-review notes

- Spec coverage: DirectFetcher (§1→T1), CompositeFetcher (§2→T2), config+view (§3→T4/T8), detail fix (§4→T3), listing archetype+transcoding (§5→T5), parseDetail (§6→T6), Gemini-zero (§7→T5/T6 by construction), attachments (§8→T4/T6), preview path (§9→T8). Alternatives/non-goals need no tasks.
- `HttpRequest.body` optional (T1) is the one shared-seam change; `postJson` and `BrowserlessFetcher` always pass `body`, so no behavior change.
- Type names used across tasks: `GrantAttachment` (T4) consumed by T6; `fetchMode` (T2) consumed by T3/T7/T8; `parseDetail` (T6) matches the spec name.
