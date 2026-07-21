# Analisi AI forte V1 — Piano 3: Worker asincrono di estrazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orchestrare `PdfTextExtractor` (Piano 2) su un endpoint Vercel richiamato da pg_cron:
prende righe `grant_documents` in `pending`, le processa entro un budget di tempo conservativo,
scrive `extracted_text`/`status`/`ocr_used`/`error`. Cron separato da quello dello scraper,
spento di default (spec §3).

**Architecture:** `runExtractionBatch(deps)` è la funzione pura orchestrata (deps iniettate,
stesso idioma di `runDigestBatch` in `app/src/lib/alerts/run-batch.ts`): reclama un documento alla
volta via una funzione `claimNextPending`, lo estrae, lo marca `ready`/`failed`, ripete finché
c'è budget o non ci sono più righe. Il claim è **atomico lato Postgres** — una funzione SQL
(`claim_pending_document()`, `FOR UPDATE SKIP LOCKED`) evita che due invocazioni cron concorrenti
processino la stessa riga; recupera anche righe `processing` bloccate da più di 10 minuti (worker
morto a metà, mai arrivato a `ready`/`failed`). La route Vercel (`/api/cron/extract-documents`)
fa da glue: costruisce le dipendenze reali (Supabase admin client, `OcrSpaceProvider`,
`PdfTextExtractor`, budget di tempo) e chiama `runExtractionBatch` — stesso schema di
`/api/cron/digest`.

**Tech Stack:** TypeScript, vitest, Supabase (RPC via `.rpc()`, `pg_cron`+`pg_net`+`FOR UPDATE
SKIP LOCKED`), il `Budget` già esistente nello scraper (riesportato, non riscritto).

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md` §3.
- Le migration sono additive e idempotenti (`create or replace function`, `cron.unschedule` prima
  di `cron.schedule`), stessa convenzione di 0011.
- Il cron di estrazione è **separato** da quello dello scraper e **spento di default**: sicuro da
  applicare, no-op finché non esistono i Vault secret `extract_endpoint_url`/`extract_cron_secret`
  (stesso pattern di 0011 — l'utente li imposta quando vuole accendere la feature).
- Il worker **non** tocca lo scraper: legge solo `grant_documents` (posseduto dall'app).
- Segue il pattern DI già in uso (`DigestBatchDeps`/`runDigestBatch`): deps come funzioni async
  iniettate, non classi. Nessuna chiamata di rete/DB reale nei test.

---

## File Structure (Piano 3)

- Modify: `scraper/src/index.ts` — riesporta `Budget`, `createBudget`, `UNLIMITED_BUDGET`.
- Create: `app/supabase/migrations/0015_extraction_scheduler.sql` — `claim_pending_document()`,
  `trigger_extract_documents()`, schedule pg_cron (spento di default).
- Modify: `app/src/lib/supabase/database.types.ts` — rigenerato (aggiunge le due function).
- Create: `app/src/lib/ai/extraction-batch.ts` — `runExtractionBatch(deps)`.
- Create: `app/src/lib/ai/__tests__/extraction-batch.test.ts`
- Create: `app/src/app/api/cron/extract-documents/route.ts`
- Create: `app/src/app/api/cron/__tests__/extract-documents-route.test.ts`
- Modify: `.claude/CLAUDE.md` — aggiunge la terza cron route alla sezione dedicata.

---

## Task 1: Riesportare `Budget` dallo scraper

**Files:**
- Modify: `scraper/src/index.ts`

**Interfaces:**
- Produces: `Budget`, `createBudget`, `UNLIMITED_BUDGET` importabili da `bandi-scraper` nell'app
  (Task 4 li usa per il budget di tempo del worker).

- [ ] **Step 1: Aggiungere la riesportazione**

In `scraper/src/index.ts`, aggiungere (vicino alle altre esportazioni di `pipeline/`):

```typescript
export { createBudget, UNLIMITED_BUDGET } from "./pipeline/budget";
export type { Budget } from "./pipeline/budget";
```

- [ ] **Step 2: Verificare che i test e il typecheck dello scraper restino verdi**

Run: `cd scraper && npm run typecheck && npm test`
Expected: nessun errore, tutti i test esistenti passano (nessuna logica nuova, solo visibilità).

- [ ] **Step 3: Verificare che l'app veda il nuovo export**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore (nessun consumatore ancora, ma il tipo deve risolvere).

- [ ] **Step 4: Commit**

```bash
git add scraper/src/index.ts
git commit -m "feat(scraper): export Budget/createBudget from the package (reused by the app worker)"
```

---

## Task 2: Migration 0015 — claim atomico + scheduler (spento di default)

**Files:**
- Create: `app/supabase/migrations/0015_extraction_scheduler.sql`

**Interfaces:**
- Produces: RPC `claim_pending_document(): { id: uuid, attachment_url: text }[]`, chiamata da
  `app/src/app/api/cron/extract-documents/route.ts` (Task 4) via `admin.rpc(...)`.

- [ ] **Step 1: Scrivere la migration**

Create `app/supabase/migrations/0015_extraction_scheduler.sql`:

```sql
-- 0015: extraction worker scheduler + atomic claim RPC (spec 2026-07-20-strong-ai-analysis-rag-v1-design.md §3).
-- claim_pending_document(): atomically claims ONE grant_documents row to process — either a fresh
-- 'pending' row, or a 'processing' row stuck for >10min (a worker that died mid-run without ever
-- marking ready/failed). FOR UPDATE SKIP LOCKED means two concurrent cron firings never claim the
-- same row (no app-level compare-and-swap needed).
-- trigger_extract_documents() + the schedule below mirror migration 0011 exactly: a SEPARATE cron
-- job from the scraper's, safe/inert until its own Vault secrets exist (extract_endpoint_url,
-- extract_cron_secret) — "spento di default" per spec §3, same as the scrape scheduler.
--
-- SECRETS: same mechanism as 0011. Before (or after) applying, store them once:
--   select vault.create_secret('https://<your-app>.vercel.app/api/cron/extract-documents', 'extract_endpoint_url');
--   select vault.create_secret('<the CRON_SECRET value>', 'extract_cron_secret');
-- Until both exist the job runs but the POST is skipped with a notice, so applying this migration
-- first is safe.

create or replace function public.claim_pending_document()
returns table (id uuid, attachment_url text)
language plpgsql
security definer set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  select gd.id into claimed_id
  from public.grant_documents gd
  where gd.status = 'pending'
     or (gd.status = 'processing' and gd.updated_at < now() - interval '10 minutes')
  order by gd.created_at asc
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  update public.grant_documents gd
  set status = 'processing', updated_at = now()
  where gd.id = claimed_id;

  return query select gd.id, gd.attachment_url from public.grant_documents gd where gd.id = claimed_id;
end;
$$;

create or replace function public.trigger_extract_documents() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'extract_endpoint_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'extract_cron_secret';
  if endpoint is null or secret is null then
    raise notice 'trigger_extract_documents: missing Vault secret(s) extract_endpoint_url / extract_cron_secret; skipping';
    return;
  end if;
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Every minute: the UI polls targeting ~1 minute readiness (spec §6), so the scheduler must be
-- at least this responsive. Each firing is a cheap fire-and-forget POST; the route itself is a
-- fast no-op when there is nothing pending.
select cron.unschedule('extract-documents-every-minute')
 where exists (select 1 from cron.job where jobname = 'extract-documents-every-minute');

select cron.schedule('extract-documents-every-minute', '* * * * *', $$ select public.trigger_extract_documents(); $$);
```

- [ ] **Step 2: Applicare la migration al progetto Supabase**

Run (MCP `apply_migration` o `cd app && npx supabase db push`):
Expected: `claim_pending_document` e `trigger_extract_documents` creati; job
`extract-documents-every-minute` presente in `cron.job` (verificabile con
`select jobname, schedule, active from cron.job;`), inerte finché i Vault secret non esistono.

- [ ] **Step 3: Rigenerare i tipi TypeScript**

Run: `cd app && npx supabase gen types typescript --project-id gptsklxbkuhdfkksmqhz > src/lib/supabase/database.types.ts`
(o MCP `generate_typescript_types`.)
Expected: `Functions` ora include `claim_pending_document` e `trigger_extract_documents`.

- [ ] **Step 4: Verificare il typecheck app**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/supabase/migrations/0015_extraction_scheduler.sql app/src/lib/supabase/database.types.ts
git commit -m "feat(db): claim_pending_document RPC + extraction cron scheduler (off by default)"
```

---

## Task 3: `runExtractionBatch` — orchestrazione (TDD)

**Files:**
- Create: `app/src/lib/ai/extraction-batch.ts`
- Test: `app/src/lib/ai/__tests__/extraction-batch.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza diretta da Piano 2 nel tipo (le deps sono funzioni astratte, non
  `OcrProvider`/`PdfTextExtractor` — il wiring concreto è nella route, Task 4).
- Produces:
  - `interface PendingDocument { id: string; attachmentUrl: string }`
  - `interface ExtractionBatchDeps { claimNextPending(): Promise<PendingDocument | null>; markReady(id: string, text: string, ocrUsed: boolean): Promise<void>; markFailed(id: string, error: string): Promise<void>; extract(url: string): Promise<{ text: string; ocrUsed: boolean }>; hasTimeFor(worstCaseMs: number): boolean }`
  - `interface ExtractionBatchResult { processed: number; ready: number; failed: number }`
  - `const EXTRACTION_WORST_CASE_MS = 60_000`
  - `async function runExtractionBatch(deps: ExtractionBatchDeps): Promise<ExtractionBatchResult>`
  - consumato dalla route (Task 4).

- [ ] **Step 1: Scrivere i primi test**

Create `app/src/lib/ai/__tests__/extraction-batch.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runExtractionBatch, EXTRACTION_WORST_CASE_MS, type ExtractionBatchDeps, type PendingDocument } from "../extraction-batch";

function fakeDeps(overrides: Partial<ExtractionBatchDeps> = {}): ExtractionBatchDeps {
  return {
    claimNextPending: vi.fn(async () => null),
    markReady: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    extract: vi.fn(async () => ({ text: "estratto", ocrUsed: false })),
    hasTimeFor: vi.fn(() => true),
    ...overrides,
  };
}

describe("runExtractionBatch", () => {
  it("returns zero counts and does nothing when there is no pending document", async () => {
    const deps = fakeDeps();
    const result = await runExtractionBatch(deps);
    expect(result).toEqual({ processed: 0, ready: 0, failed: 0 });
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("processes one document end-to-end and marks it ready", async () => {
    const doc: PendingDocument = { id: "doc-1", attachmentUrl: "https://example.org/a.pdf" };
    let claimed = false;
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => {
        if (claimed) return null;
        claimed = true;
        return doc;
      }),
      extract: vi.fn(async (url: string) => {
        expect(url).toBe(doc.attachmentUrl);
        return { text: "Testo estratto", ocrUsed: true };
      }),
    });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 1, ready: 1, failed: 0 });
    expect(deps.markReady).toHaveBeenCalledWith("doc-1", "Testo estratto", true);
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("marks a document failed (not a thrown error) when extraction throws", async () => {
    const doc: PendingDocument = { id: "doc-2", attachmentUrl: "https://example.org/b.pdf" };
    let claimed = false;
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => {
        if (claimed) return null;
        claimed = true;
        return doc;
      }),
      extract: vi.fn(async () => {
        throw new Error("PDF corrotto");
      }),
    });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 1, ready: 0, failed: 1 });
    expect(deps.markFailed).toHaveBeenCalledWith("doc-2", "PDF corrotto");
    expect(deps.markReady).not.toHaveBeenCalled();
  });

  it("loops until claimNextPending returns null, processing each document", async () => {
    const docs: PendingDocument[] = [
      { id: "d1", attachmentUrl: "https://x/1.pdf" },
      { id: "d2", attachmentUrl: "https://x/2.pdf" },
      { id: "d3", attachmentUrl: "https://x/3.pdf" },
    ];
    const deps = fakeDeps({ claimNextPending: vi.fn(async () => docs.shift() ?? null) });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 3, ready: 3, failed: 0 });
    expect(deps.extract).toHaveBeenCalledTimes(3);
  });

  it("stops claiming more work once the time budget is exhausted", async () => {
    const doc: PendingDocument = { id: "d1", attachmentUrl: "https://x/1.pdf" };
    const hasTimeFor = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => doc),
      hasTimeFor,
    });

    const result = await runExtractionBatch(deps);

    expect(result.processed).toBe(1); // only the first hasTimeFor(true) let it claim work
    expect(deps.claimNextPending).toHaveBeenCalledTimes(1);
  });

  it("checks the budget with EXTRACTION_WORST_CASE_MS", async () => {
    const deps = fakeDeps();
    await runExtractionBatch(deps);
    expect(deps.hasTimeFor).toHaveBeenCalledWith(EXTRACTION_WORST_CASE_MS);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/extraction-batch.test.ts`
Expected: FAIL — `Cannot find module '../extraction-batch'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/extraction-batch.ts`:

```typescript
// app/src/lib/ai/extraction-batch.ts
// Orchestrates the extraction worker with all I/O injected (spec §3), same idiom as
// app/src/lib/alerts/run-batch.ts. Claims one grant_documents row at a time and processes it
// until the time budget runs out or there is nothing left pending — never starts a document
// unless the worst case still fits, so a call can't straddle Vercel's maxDuration.
export interface PendingDocument {
  id: string;
  attachmentUrl: string;
}

export interface ExtractionBatchDeps {
  claimNextPending(): Promise<PendingDocument | null>;
  markReady(id: string, text: string, ocrUsed: boolean): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  extract(url: string): Promise<{ text: string; ocrUsed: boolean }>;
  hasTimeFor(worstCaseMs: number): boolean;
}

export interface ExtractionBatchResult {
  processed: number;
  ready: number;
  failed: number;
}

// Conservative single-document worst case: download + unpdf + OCR.space round trip.
export const EXTRACTION_WORST_CASE_MS = 60_000;

export async function runExtractionBatch(deps: ExtractionBatchDeps): Promise<ExtractionBatchResult> {
  const result: ExtractionBatchResult = { processed: 0, ready: 0, failed: 0 };

  while (deps.hasTimeFor(EXTRACTION_WORST_CASE_MS)) {
    const doc = await deps.claimNextPending();
    if (!doc) break;

    try {
      const { text, ocrUsed } = await deps.extract(doc.attachmentUrl);
      await deps.markReady(doc.id, text, ocrUsed);
      result.ready += 1;
    } catch (err) {
      await deps.markFailed(doc.id, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
    result.processed += 1;
  }

  return result;
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/extraction-batch.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/extraction-batch.ts app/src/lib/ai/__tests__/extraction-batch.test.ts
git commit -m "feat(ai): runExtractionBatch — budget-aware extraction worker orchestration"
```

---

## Task 4: Route `/api/cron/extract-documents`

**Files:**
- Create: `app/src/app/api/cron/extract-documents/route.ts`
- Test: `app/src/app/api/cron/__tests__/extract-documents-route.test.ts`

**Interfaces:**
- Consumes: `runExtractionBatch` (Task 3), `createAdminClient` (`@/lib/supabase/admin`),
  `getOcrProvider` (Piano 2), `createPdfTextExtractor` (Piano 2), `createBudget` (Task 1,
  `bandi-scraper`), `isAuthorized` (`../auth`).
- Produces: `GET`/`POST` handlers, stesso schema di risposta delle altre cron route
  (`{ ok, ... }` / `{ ok: false, error }`).

- [ ] **Step 1: Scrivere il test della route (mock dell'intera batch, come `route.test.ts`)**

Create `app/src/app/api/cron/__tests__/extract-documents-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/ai/extraction-batch", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/ai/extraction-batch")>(
    "../../../../lib/ai/extraction-batch",
  );
  return { ...actual, runExtractionBatch: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("../../../../lib/ai/ocr-provider", () => ({ getOcrProvider: vi.fn(() => ({ ocr: vi.fn() })) }));

import { GET, POST } from "../extract-documents/route";
import { runExtractionBatch } from "@/lib/ai/extraction-batch";

function post(auth?: string): Request {
  return new Request("http://localhost/api/cron/extract-documents", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/extract-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret";
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(runExtractionBatch).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret (401)", async () => {
    const res = await POST(post("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runExtractionBatch).not.toHaveBeenCalled();
  });

  it("runs the batch and returns its counts with the correct secret", async () => {
    vi.mocked(runExtractionBatch).mockResolvedValueOnce({ processed: 2, ready: 1, failed: 1 });
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(runExtractionBatch).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.ready).toBe(1);
    expect(body.failed).toBe(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 when the batch throws", async () => {
    vi.mocked(runExtractionBatch).mockRejectedValueOnce(new Error("OCR_SPACE_API_KEY non impostata"));
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/OCR_SPACE_API_KEY/);
  });

  it("GET handler works the same as POST", async () => {
    vi.mocked(runExtractionBatch).mockResolvedValueOnce({ processed: 0, ready: 0, failed: 0 });
    const req = new Request("http://localhost/api/cron/extract-documents", {
      headers: { authorization: "Bearer s3cret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(runExtractionBatch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/app/api/cron/__tests__/extract-documents-route.test.ts`
Expected: FAIL — `Cannot find module '../extract-documents/route'`.

- [ ] **Step 3: Implementare la route**

Create `app/src/app/api/cron/extract-documents/route.ts`:

```typescript
import { createBudget } from "bandi-scraper";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOcrProvider } from "@/lib/ai/ocr-provider";
import { createPdfTextExtractor } from "@/lib/ai/pdf-text-extractor";
import { runExtractionBatch } from "@/lib/ai/extraction-batch";
import { isAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Downloading + OCR-ing several PDFs can exceed the default 60s; Hobby plan caps at 300s.
export const maxDuration = 300;

// Conservative soft deadline below Vercel's hard 300s kill, mirroring the scraper's budget.ts.
const EXTRACTION_BUDGET_MS = 270_000;

// Triggered by the extraction pg_cron scheduler (migration 0015). Protected by CRON_SECRET so
// only the scheduler (or an authorized manual call) can start a run. Separate cron/route from
// /api/cron/scrape — this one is off until its own Vault secrets are configured (spec §3).
export async function GET(request: Request): Promise<Response> {
  return handleExtract(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleExtract(request);
}

async function handleExtract(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const extractor = createPdfTextExtractor({ ocr: getOcrProvider() });
  const budget = createBudget(EXTRACTION_BUDGET_MS);

  try {
    const result = await runExtractionBatch({
      hasTimeFor: (worstCaseMs) => budget.hasTimeFor(worstCaseMs),
      extract: (url) => extractor.extract(url),
      async claimNextPending() {
        const { data, error } = await admin.rpc("claim_pending_document");
        if (error) throw new Error(`claim_pending_document: ${error.message}`);
        const row = data?.[0];
        return row ? { id: row.id, attachmentUrl: row.attachment_url } : null;
      },
      async markReady(id, text, ocrUsed) {
        const { error } = await admin
          .from("grant_documents")
          .update({ status: "ready", extracted_text: text, ocr_used: ocrUsed, error: null, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(`markReady: ${error.message}`);
      },
      async markFailed(id, message) {
        const { error } = await admin
          .from("grant_documents")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(`markFailed: ${error.message}`);
      },
    });
    console.log("[cron/extract-documents]", JSON.stringify(result));
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/extract-documents] failed:", message);
    return Response.json({ ok: false, error: message }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/app/api/cron/__tests__/extract-documents-route.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api/cron/extract-documents/route.ts app/src/app/api/cron/__tests__/extract-documents-route.test.ts
git commit -m "feat(ai): /api/cron/extract-documents route wiring the extraction worker"
```

---

## Task 5: Documentazione + verifica finale

**Files:**
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Aggiungere la route alla sezione Cron routes**

In `.claude/CLAUDE.md`, sotto `### Cron routes`, aggiungere:

```markdown
- `/api/cron/extract-documents` — worker di estrazione testo PDF per l'analisi forte (Piano 3/6, spento finché i Vault secret `extract_endpoint_url`/`extract_cron_secret` non sono impostati)
```

- [ ] **Step 2: Eseguire l'intera suite app**

Run: `cd app && npm test`
Expected: tutti i test passano (esistenti + nuovi di questo piano).

- [ ] **Step 3: Typecheck finale app e scraper**

Run: `cd app && npx tsc --noEmit && cd ../scraper && npm run typecheck`
Expected: nessun errore in entrambi.

- [ ] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(ai): document /api/cron/extract-documents (strong AI analysis V1, plan 3/6)"
```

---

## Self-Review (Piano 3)

- **Copertura spec:** §3 "Esecuzione asincrona" → Task 2 (scheduler pg_cron+pg_net, spento di
  default, cron **separato** dallo scraper) + Task 3/4 (worker che processa `pending` per-
  documento). "Worker di estrazione" (Componenti) → Task 3 (`runExtractionBatch`) + Task 4
  (route). Rischio "estrazione > 300s" → budget conservativo (270s) + claim atomico per-
  documento, mai in-flight oltre il limite. Coperto.
- **Fuori scope (corretto):** generazione dell'analisi forte e route `prepare`/`status`
  (Piano 4), chat (Piano 5), UI (Piano 6).
- **Placeholder:** nessun TBD; SQL, TS e test completi.
- **Consistenza tipi:** `PendingDocument`, `ExtractionBatchDeps`, `runExtractionBatch` usati
  identici tra `extraction-batch.ts`, il suo test, e la route. Le colonne aggiornate in
  `markReady`/`markFailed` (`status`, `extracted_text`, `ocr_used`, `error`, `updated_at`)
  combaciano con lo schema di `grant_documents` (migration 0014).
- **Nota per l'utente (non un task, azione manuale):** dopo aver applicato la migration 0015,
  il cron resta inerte finché non vengono impostati i due Vault secret (vedi commento in testa
  alla migration) — stesso meccanismo "spento finché non lo accendi tu" già usato per lo
  scheduler dello scraper in 0011 (verificato: nessun job `scrape-every-6-min` in `cron.job`,
  solo `scrape-daily` disattivato — **scelta intenzionale dell'utente**, non un difetto: lo
  scraping va acceso quando l'utente decide, non di default). Vale lo stesso principio per questo
  cron di estrazione: resta spento finché non imposti tu i Vault secret quando vorrai attivarlo.
