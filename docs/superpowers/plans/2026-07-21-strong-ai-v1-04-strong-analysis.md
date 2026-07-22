# Analisi AI forte V1 — Piano 4: Analisi forte (generazione) + prepare/status

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere disponibile l'analisi ricca (4 sezioni, fondata sul testo reale dei PDF) e le
due route che la sbloccano: `prepare` (innesca l'estrazione, Piano 3) e `status` (polling della
readiness). Riusa `analyzeGrant`/`analysisSchema` esistenti (spec §1: "stesso schema a 4 sezioni")
— **nessuna nuova route "strong analyze"**: la route esistente `/api/ai/analyze` produce
automaticamente l'analisi ricca quando trova documenti `ready` per quel bando, altrimenti si
comporta esattamente come oggi (fallback trasparente, zero regressioni).

**Architecture:** `buildStrongAnalysisDocument` estende `buildAnalysisDocument` aggiungendo il
testo integrale dei documenti; `analyzeGrant` accetta un quinto parametro opzionale `documents` e
sceglie internamente quale builder usare — i chiamanti esistenti (senza `documents`) restano
identici bit-per-bit. `deriveReadiness` è una funzione pura (nessun I/O) che, dato il numero di
allegati PDF del bando e le righe `grant_documents` esistenti, determina lo stato UI (spec §9):
`no_documents` (niente PDF nel bando), `not_started` (PDF presenti, mai richiesta l'estrazione),
`preparing`, `ready`, `ready_partial` (fallimento parziale, si procede col disponibile),
`failed_total`. La route `prepare` è l'unica a **scrivere**: crea righe `pending` per gli
allegati PDF non ancora tracciati (via `createAdminClient`, perché la scrittura su
`grant_documents` è riservata a `service_role`, spec §7) e consuma l'entitlement `extraction`
**solo** quando crea almeno una riga nuova (spec §8: il primo utente innesca, gli altri sono
gratis). La route `status` è pura lettura (RLS `grant_documents_read` già permette il select a
ogni autenticato).

**Tech Stack:** TypeScript, vitest, `checkEntitlement` (Piano 1), Supabase RLS/admin client.

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md`
  §1, §7, §8, §9.
- Login + profilo obbligatori per ogni route di questo piano (spec §8), stesso pattern di
  `/api/ai/analyze`.
- **Zero regressioni**: `analyzeGrant`/`buildAnalysisDocument` restano compatibili con ogni
  chiamata esistente (documents opzionale, default `[]`).
- Un allegato è "PDF" se `mimeType === "application/pdf"` oppure (mimeType assente e
  `url` termina in `.pdf`, case-insensitive) — lo scraper non garantisce sempre il mimeType.
- Nessuna nuova route per la generazione: si riusa `/api/ai/analyze` (Componenti della spec
  elenca solo `prepare`/`status`/`chat` come route nuove).

---

## File Structure (Piano 4)

- Modify: `app/src/lib/ai/analyze-grant.ts` — `buildStrongAnalysisDocument`, `DocumentText`,
  `analyzeGrant` con quinto parametro opzionale.
- Modify: `app/src/lib/ai/__tests__/analyze-grant.test.ts` — nuovi test, esistenti invariati.
- Create: `app/src/lib/ai/document-readiness.ts` — `deriveReadiness`, `ReadinessState`.
- Create: `app/src/lib/ai/__tests__/document-readiness.test.ts`
- Create: `app/src/lib/grants/pdf-attachments.ts` — `filterPdfAttachments(attachments)`.
- Create: `app/src/lib/grants/__tests__/pdf-attachments.test.ts`
- Create: `app/src/app/api/ai/strong/prepare/route.ts`
- Create: `app/src/app/api/ai/strong/__tests__/prepare-route.test.ts`
- Create: `app/src/app/api/ai/strong/status/route.ts`
- Create: `app/src/app/api/ai/strong/__tests__/status-route.test.ts`
- Modify: `app/src/app/api/ai/analyze/route.ts` — include i documenti `ready` quando esistono.
- Modify: `app/src/app/api/ai/__tests__/analyze-route.test.ts` — nuovo test del percorso arricchito.

---

## Task 1: `buildStrongAnalysisDocument` + `analyzeGrant` arricchito

**Files:**
- Modify: `app/src/lib/ai/analyze-grant.ts`
- Modify: `app/src/lib/ai/__tests__/analyze-grant.test.ts`

**Interfaces:**
- Produces:
  - `interface DocumentText { title: string; text: string }`
  - `function buildStrongAnalysisDocument(input: AnalysisProfileInput, grant: Grant, providerName: string | null, documents: DocumentText[]): string`
  - `analyzeGrant(llm, input, grant, providerName, documents: DocumentText[] = [])` — quinto
    parametro opzionale, retrocompatibile.
  - consumato dalla route `/api/ai/analyze` (Task 5).

- [ ] **Step 1: Aggiungere i test (append al file esistente, senza toccare i test già presenti)**

Append to `app/src/lib/ai/__tests__/analyze-grant.test.ts`:

```typescript
import { buildStrongAnalysisDocument, type DocumentText } from "../analyze-grant";

describe("buildStrongAnalysisDocument", () => {
  it("returns exactly buildAnalysisDocument's output when there are no documents", () => {
    expect(buildStrongAnalysisDocument(input, grant, "Fondazione Test", [])).toBe(
      buildAnalysisDocument(input, grant, "Fondazione Test"),
    );
  });

  it("appends the full text of each document after the base document", () => {
    const documents: DocumentText[] = [
      { title: "Avviso pubblico.pdf", text: "Articolo 1: finalità del bando..." },
      { title: "Modulo domanda.pdf", text: "Il sottoscritto richiede il contributo..." },
    ];
    const doc = buildStrongAnalysisDocument(input, grant, "Fondazione Test", documents);
    expect(doc).toContain(buildAnalysisDocument(input, grant, "Fondazione Test"));
    expect(doc).toContain("Avviso pubblico.pdf");
    expect(doc).toContain("Articolo 1: finalità del bando...");
    expect(doc).toContain("Modulo domanda.pdf");
    expect(doc).toContain("Il sottoscritto richiede il contributo...");
  });
});

describe("analyzeGrant with documents", () => {
  it("sends the strong document (including PDF text) to the provider when documents are given", async () => {
    let capturedHtml = "";
    const llm: LLMProvider = {
      name: "stub",
      extract: async (args) => {
        capturedHtml = args.html;
        return validOutput;
      },
    };
    const documents: DocumentText[] = [{ title: "Avviso.pdf", text: "Testo unico riconoscibile XYZ123" }];
    await analyzeGrant(llm, input, grant, "Fondazione Test", documents);
    expect(capturedHtml).toContain("Testo unico riconoscibile XYZ123");
  });

  it("falls back to the plain document when documents is omitted (backward compatible)", async () => {
    let capturedHtml = "";
    const llm: LLMProvider = {
      name: "stub",
      extract: async (args) => {
        capturedHtml = args.html;
        return validOutput;
      },
    };
    await analyzeGrant(llm, input, grant, "Fondazione Test");
    expect(capturedHtml).toBe(buildAnalysisDocument(input, grant, "Fondazione Test"));
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/analyze-grant.test.ts`
Expected: FAIL — `buildStrongAnalysisDocument` non esportato da `../analyze-grant`.

- [ ] **Step 3: Implementare**

In `app/src/lib/ai/analyze-grant.ts`, aggiungere dopo `buildAnalysisDocument` e sostituire la
firma/corpo di `analyzeGrant`:

```typescript
export interface DocumentText {
  title: string;
  text: string;
}

// Extends buildAnalysisDocument with the full text of the grant's PDF attachments (spec §1: same
// 4-section schema, richer input). With zero documents it's byte-identical to the plain document
// — the quick-analysis path is untouched.
export function buildStrongAnalysisDocument(
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
): string {
  const base = buildAnalysisDocument(input, grant, providerName);
  if (documents.length === 0) return base;
  const sections = documents.map((d, i) => `--- Documento ${i + 1}: ${d.title} ---\n${d.text}`);
  return [base, "", "== TESTO INTEGRALE DEI DOCUMENTI ALLEGATI ==", ...sections].join("\n");
}
```

Replace the existing `analyzeGrant` function with:

```typescript
export async function analyzeGrant(
  llm: LLMProvider,
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[] = [],
): Promise<GrantAnalysis> {
  const document =
    documents.length > 0
      ? buildStrongAnalysisDocument(input, grant, providerName, documents)
      : buildAnalysisDocument(input, grant, providerName);

  let raw = await llm.extract({
    html: document,
    schema: ANALYSIS_JSON_SCHEMA,
    instructions: ANALYSIS_INSTRUCTIONS,
  });
  if (typeof raw === "string") raw = JSON.parse(raw); // a malformed string throws here
  const parsed = analysisSchema.parse(raw); // malformed shape throws here

  const total =
    parsed.punti_di_forza.length + parsed.rischi.length +
    parsed.suggerimenti.length + parsed.passi_successivi.length;
  if (total === 0) throw new Error("empty analysis");

  return {
    puntiDiForza: parsed.punti_di_forza,
    rischi: parsed.rischi,
    suggerimenti: parsed.suggerimenti,
    passiSuccessivi: parsed.passi_successivi,
  };
}
```

- [ ] **Step 4: Eseguire tutti i test del file per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/analyze-grant.test.ts`
Expected: PASS (tutti — i preesistenti invariati più i nuovi).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/analyze-grant.ts app/src/lib/ai/__tests__/analyze-grant.test.ts
git commit -m "feat(ai): buildStrongAnalysisDocument — analyzeGrant reads PDF text when available"
```

---

## Task 2: `deriveReadiness`

**Files:**
- Create: `app/src/lib/ai/document-readiness.ts`
- Test: `app/src/lib/ai/__tests__/document-readiness.test.ts`

**Interfaces:**
- Produces:
  - `type ReadinessState = "no_documents" | "not_started" | "preparing" | "ready" | "ready_partial" | "failed_total"`
  - `interface DocumentStatusRow { status: string }`
  - `function deriveReadiness(totalPdfCount: number, rows: DocumentStatusRow[]): ReadinessState`
  - consumato da `prepare`/`status` route (Task 3/4).

- [ ] **Step 1: Scrivere i test**

Create `app/src/lib/ai/__tests__/document-readiness.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveReadiness } from "../document-readiness";

describe("deriveReadiness", () => {
  it("is no_documents when the grant has zero PDF attachments", () => {
    expect(deriveReadiness(0, [])).toBe("no_documents");
  });

  it("is not_started when there are PDFs but extraction was never requested", () => {
    expect(deriveReadiness(2, [])).toBe("not_started");
  });

  it("is preparing while any row is pending or processing", () => {
    expect(deriveReadiness(2, [{ status: "pending" }, { status: "ready" }])).toBe("preparing");
    expect(deriveReadiness(2, [{ status: "processing" }, { status: "ready" }])).toBe("preparing");
  });

  it("is ready when every row is ready", () => {
    expect(deriveReadiness(2, [{ status: "ready" }, { status: "ready" }])).toBe("ready");
  });

  it("is ready_partial when some rows are ready and the rest failed", () => {
    expect(deriveReadiness(2, [{ status: "ready" }, { status: "failed" }])).toBe("ready_partial");
  });

  it("is failed_total when every row failed", () => {
    expect(deriveReadiness(2, [{ status: "failed" }, { status: "failed" }])).toBe("failed_total");
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/document-readiness.test.ts`
Expected: FAIL — `Cannot find module '../document-readiness'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/document-readiness.ts`:

```typescript
// app/src/lib/ai/document-readiness.ts
// Pure derivation of the "strong analysis" UI state (spec §9) from the grant's PDF count and its
// grant_documents rows. No I/O — callers (prepare/status routes) fetch the inputs.
export type ReadinessState =
  | "no_documents"
  | "not_started"
  | "preparing"
  | "ready"
  | "ready_partial"
  | "failed_total";

export interface DocumentStatusRow {
  status: string;
}

export function deriveReadiness(totalPdfCount: number, rows: DocumentStatusRow[]): ReadinessState {
  if (totalPdfCount === 0) return "no_documents";
  if (rows.length === 0) return "not_started";
  if (rows.some((r) => r.status === "pending" || r.status === "processing")) return "preparing";

  const readyCount = rows.filter((r) => r.status === "ready").length;
  if (readyCount === 0) return "failed_total";
  if (readyCount < rows.length) return "ready_partial";
  return "ready";
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/document-readiness.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/document-readiness.ts app/src/lib/ai/__tests__/document-readiness.test.ts
git commit -m "feat(ai): deriveReadiness — pure UI-state derivation for the strong-analysis card"
```

---

## Task 3: `filterPdfAttachments`

**Files:**
- Create: `app/src/lib/grants/pdf-attachments.ts`
- Test: `app/src/lib/grants/__tests__/pdf-attachments.test.ts`

**Interfaces:**
- Consumes: `Attachment` (`@/lib/matching`, già esistente: `{title, url, mimeType}`).
- Produces: `function filterPdfAttachments(attachments: Attachment[]): Attachment[]` — consumato
  dalle route `prepare`/`status` (Task 4/5) e dalla route `analyze` (Task 6).

- [ ] **Step 1: Scrivere i test**

Create `app/src/lib/grants/__tests__/pdf-attachments.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterPdfAttachments } from "../pdf-attachments";
import type { Attachment } from "@/lib/matching";

describe("filterPdfAttachments", () => {
  it("keeps attachments with mimeType application/pdf", () => {
    const atts: Attachment[] = [{ title: "Avviso", url: "https://x/a", mimeType: "application/pdf" }];
    expect(filterPdfAttachments(atts)).toEqual(atts);
  });

  it("keeps attachments with no mimeType but a .pdf URL (case-insensitive)", () => {
    const atts: Attachment[] = [{ title: "Avviso", url: "https://x/a.PDF", mimeType: null }];
    expect(filterPdfAttachments(atts)).toEqual(atts);
  });

  it("drops attachments that are neither application/pdf nor a .pdf URL", () => {
    const atts: Attachment[] = [
      { title: "Logo", url: "https://x/logo.png", mimeType: "image/png" },
      { title: "Pagina", url: "https://x/pagina", mimeType: null },
    ];
    expect(filterPdfAttachments(atts)).toEqual([]);
  });

  it("returns [] for an empty list", () => {
    expect(filterPdfAttachments([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/grants/__tests__/pdf-attachments.test.ts`
Expected: FAIL — `Cannot find module '../pdf-attachments'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/grants/pdf-attachments.ts`:

```typescript
// app/src/lib/grants/pdf-attachments.ts
// A grant's PDF-only attachments — the strong-analysis feature only ever reads PDFs. The scraper
// doesn't always capture a mimeType, so a .pdf URL extension is an accepted fallback signal.
import type { Attachment } from "@/lib/matching";

export function filterPdfAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter(
    (a) => a.mimeType === "application/pdf" || (!a.mimeType && a.url.toLowerCase().endsWith(".pdf")),
  );
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/grants/__tests__/pdf-attachments.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/grants/pdf-attachments.ts app/src/lib/grants/__tests__/pdf-attachments.test.ts
git commit -m "feat(grants): filterPdfAttachments — PDF-only attachment filter for strong analysis"
```

---

## Task 4: Route `POST /api/ai/strong/prepare`

**Files:**
- Create: `app/src/app/api/ai/strong/prepare/route.ts`
- Test: `app/src/app/api/ai/strong/__tests__/prepare-route.test.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `createAdminClient`
  (`@/lib/supabase/admin`), `getGrant` (`@/lib/grants/queries`), `filterPdfAttachments`
  (Task 3), `checkEntitlement` (Piano 1, `@/lib/ai/entitlement`), `deriveReadiness` (Task 2).
- Produces: `POST` handler, `{ readiness: ReadinessState }` su successo.

- [ ] **Step 1: Scrivere il test della route**

Create `app/src/app/api/ai/strong/__tests__/prepare-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const profileFrom = vi.fn();
const checkEntitlement = vi.fn();
const adminSelect = vi.fn();
const adminUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: profileFrom }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "grant_documents") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => adminSelect() }),
        upsert: (rows: unknown, opts: unknown) => adminUpsert(rows, opts),
      };
    },
  }),
}));
vi.mock("@/lib/ai/entitlement", () => ({ checkEntitlement: (...a: unknown[]) => checkEntitlement(...a) }));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));

import { POST } from "../prepare/route";
import { getGrant } from "@/lib/grants/queries";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/strong/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const grantWithPdf = {
  grant: {
    id: "g1",
    attachments: [{ title: "Avviso.pdf", url: "https://x/avviso.pdf", mimeType: "application/pdf" }],
  },
  providerName: "Fondazione Test",
};

beforeEach(() => {
  getUser.mockReset();
  profileFrom.mockReset();
  checkEntitlement.mockReset();
  adminSelect.mockReset();
  adminUpsert.mockReset();
  vi.mocked(getGrant).mockReset();
  profileFrom.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u1" } }) }) }),
  });
});

describe("POST /api/ai/strong/prepare", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a missing grantId", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await POST(post({ grantId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns no_documents without touching entitlement/DB when the grant has no PDFs", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue({ grant: { id: "g1", attachments: [] }, providerName: null });
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("no_documents");
    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(adminUpsert).not.toHaveBeenCalled();
  });

  it("creates pending rows and consumes the extraction entitlement on first trigger", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [] }); // no existing rows yet
    checkEntitlement.mockResolvedValue({ allowed: true });
    adminUpsert.mockResolvedValue({ error: null });

    const res = await POST(post({ grantId: "g1" }));

    expect(checkEntitlement).toHaveBeenCalledWith(expect.anything(), "u1", "extraction");
    expect(adminUpsert).toHaveBeenCalledTimes(1);
    const [rows] = adminUpsert.mock.calls[0]!;
    expect(rows).toEqual([{ grant_id: "g1", attachment_url: "https://x/avviso.pdf", status: "pending" }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("preparing");
  });

  it("skips entitlement and DB writes when every attachment is already tracked", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [{ attachment_url: "https://x/avviso.pdf", status: "ready" }] });

    const res = await POST(post({ grantId: "g1" }));

    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(adminUpsert).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.readiness).toBe("ready");
  });

  it("returns 429 when the daily extraction entitlement is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [] });
    checkEntitlement.mockResolvedValue({ allowed: false });

    const res = await POST(post({ grantId: "g1" }));

    expect(res.status).toBe(429);
    expect(adminUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/prepare-route.test.ts`
Expected: FAIL — `Cannot find module '../prepare/route'`.

- [ ] **Step 3: Implementare**

Create `app/src/app/api/ai/strong/prepare/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrant } from "@/lib/grants/queries";
import { filterPdfAttachments } from "@/lib/grants/pdf-attachments";
import { checkEntitlement } from "@/lib/ai/entitlement";
import { deriveReadiness } from "@/lib/ai/document-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opt-in trigger for the strong analysis (spec §1/§2): the first authenticated user to request it
// creates the pending grant_documents rows (shared, everyone else is free); the daily "extraction"
// entitlement bucket only counts NEW rows, never a re-check of an already-tracked grant.
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let grantId: unknown;
  try {
    ({ grantId } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof grantId !== "string" || !grantId) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const pdfs = filterPdfAttachments(view.grant.attachments);
  if (pdfs.length === 0) return Response.json({ readiness: "no_documents" });

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from("grant_documents")
    .select("attachment_url, status")
    .eq("grant_id", grantId);
  const existingUrls = new Set((existingRows ?? []).map((r) => r.attachment_url));
  const missing = pdfs.filter((p) => !existingUrls.has(p.url));

  if (missing.length > 0) {
    const { allowed } = await checkEntitlement(supabase, user.id, "extraction");
    if (!allowed) {
      return Response.json(
        { error: "Hai raggiunto il limite giornaliero di nuove estrazioni. Riprova domani." },
        { status: 429 },
      );
    }
    const { error } = await admin.from("grant_documents").upsert(
      missing.map((p) => ({ grant_id: grantId, attachment_url: p.url, status: "pending" })),
      { onConflict: "grant_id,attachment_url", ignoreDuplicates: true },
    );
    if (error) {
      return Response.json({ error: "Impossibile avviare l'estrazione. Riprova." }, { status: 502 });
    }
  }

  const rows = [...(existingRows ?? []), ...missing.map(() => ({ status: "pending" }))];
  return Response.json({ readiness: deriveReadiness(pdfs.length, rows) });
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/prepare-route.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api/ai/strong/prepare/route.ts app/src/app/api/ai/strong/__tests__/prepare-route.test.ts
git commit -m "feat(ai): POST /api/ai/strong/prepare — triggers shared PDF extraction"
```

---

## Task 5: Route `GET /api/ai/strong/status`

**Files:**
- Create: `app/src/app/api/ai/strong/status/route.ts`
- Test: `app/src/app/api/ai/strong/__tests__/status-route.test.ts`

**Interfaces:**
- Consumes: gli stessi seam del Task 4 (senza `checkEntitlement`/scritture — pura lettura).
- Produces: `GET` handler, `{ readiness: ReadinessState }`.

- [ ] **Step 1: Scrivere il test della route**

Create `app/src/app/api/ai/strong/__tests__/status-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));

import { GET } from "../status/route";
import { getGrant } from "@/lib/grants/queries";

function get(grantId?: string): Request {
  const url = new URL("http://localhost/api/ai/strong/status");
  if (grantId) url.searchParams.set("grantId", grantId);
  return new Request(url);
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  vi.mocked(getGrant).mockReset();
});

function mockTables(profile: unknown, documentRows: unknown[]) {
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) };
    }
    if (table === "grant_documents") {
      return { select: () => ({ eq: async () => ({ data: documentRows }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("GET /api/ai/strong/status", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(get("g1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when grantId is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(get());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ user_id: "u1" }, []);
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await GET(get("g1"));
    expect(res.status).toBe(404);
  });

  it("reports readiness derived from the grant's PDFs and its document rows", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ user_id: "u1" }, [{ status: "ready" }]);
    vi.mocked(getGrant).mockResolvedValue({
      grant: { id: "g1", attachments: [{ title: "A.pdf", url: "https://x/a.pdf", mimeType: "application/pdf" }] },
      providerName: null,
    });
    const res = await GET(get("g1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("ready");
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/status-route.test.ts`
Expected: FAIL — `Cannot find module '../status/route'`.

- [ ] **Step 3: Implementare**

Create `app/src/app/api/ai/strong/status/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getGrant } from "@/lib/grants/queries";
import { filterPdfAttachments } from "@/lib/grants/pdf-attachments";
import { deriveReadiness } from "@/lib/ai/document-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only polling endpoint (spec §6): the UI polls this every ~8-10s while readiness is
// "preparing", then swaps in the analysis + chat once it flips to "ready"/"ready_partial".
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const grantId = new URL(request.url).searchParams.get("grantId");
  if (!grantId) return Response.json({ error: "Richiesta non valida." }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const pdfCount = filterPdfAttachments(view.grant.attachments).length;
  const { data: rows } = await supabase
    .from("grant_documents").select("status").eq("grant_id", grantId);

  return Response.json({ readiness: deriveReadiness(pdfCount, rows ?? []) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/status-route.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api/ai/strong/status/route.ts app/src/app/api/ai/strong/__tests__/status-route.test.ts
git commit -m "feat(ai): GET /api/ai/strong/status — polling endpoint for extraction readiness"
```

---

## Task 6: `/api/ai/analyze` legge i documenti pronti

**Files:**
- Modify: `app/src/app/api/ai/analyze/route.ts`
- Modify: `app/src/app/api/ai/__tests__/analyze-route.test.ts`

**Interfaces:**
- Consumes: `DocumentText` (Task 1), stesso `supabase` client già creato nella route.
- Nessuna nuova interfaccia pubblica: comportamento esistente esteso, non un nuovo endpoint.

- [ ] **Step 1: Aggiungere il test del percorso arricchito (i 3 test esistenti restano intatti)**

Append to `app/src/app/api/ai/__tests__/analyze-route.test.ts`:

```typescript
describe("POST /api/ai/analyze with ready documents", () => {
  it("includes the extracted PDF text in the document sent to the provider", async () => {
    const { getProvider } = await import("@/lib/ai/provider");
    let capturedHtml = "";
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async (args: { html: string }) => {
        capturedHtml = args.html;
        return {
          punti_di_forza: ["ok"], rischi: [], suggerimenti: [], passi_successivi: [],
        };
      },
    });

    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    consumeAnalysisQuota.mockResolvedValue({ allowed: true });
    const { getGrant } = await import("@/lib/grants/queries");
    vi.mocked(getGrant).mockResolvedValue({
      grant: {
        id: "g1", title: "Bando", providerId: null, providerKind: null, deadline: null,
        status: "aperto", grantType: "bando", amount: null, cofundingRequired: null,
        cofundingPercentage: null, eligibleTypes: [], tags: [], area: null, geoScope: null,
        complexity: null, requiredDocuments: [], summary: "", requirements: "", url: "https://x",
        beneficiaries: "", openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
        eligibleExpenses: null, applicationMethod: null, contactInfo: null,
        attachments: [{ title: "Avviso.pdf", url: "https://x/avviso.pdf", mimeType: "application/pdf" }],
      },
      providerName: null,
    });

    profileFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: "u1", legal_type: "APS", themes: [], operating_provinces: [], project_history: [], income_sources: [], beneficiaries: [] },
              }),
            }),
          }),
        };
      }
      if (table === "grant_documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{ attachment_url: "https://x/avviso.pdf", extracted_text: "Testo unico riconoscibile XYZ123" }],
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await analyzePost(post({ grantId: "g1" }));
    expect(res.status).toBe(200);
    expect(capturedHtml).toContain("Testo unico riconoscibile XYZ123");
  });
});
```

Also update the module mocks at the top of the file — replace the `createClient` mock and add a
`getProvider` mock:

```typescript
const profileFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: profileFrom }),
}));
vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>("@/lib/ai/provider");
  return { ...actual, getProvider: vi.fn() };
});
```

(Add `profileFrom.mockReset()` to the existing `beforeEach`, and make the three pre-existing
tests pass a `from` no-op by leaving `profileFrom` unset — they all return before `.from` is
called, exactly as today.)

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/app/api/ai/__tests__/analyze-route.test.ts`
Expected: FAIL — la route non legge ancora `grant_documents`, `capturedHtml` non contiene il
testo del documento (o l'assert sul contenuto fallisce).

- [ ] **Step 3: Implementare**

Modify `app/src/app/api/ai/analyze/route.ts` — sostituire il blocco tra il caricamento del
profilo e la chiamata a `analyzeGrant`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import { analyzeGrant, type DocumentText } from "@/lib/ai/analyze-grant";
import { consumeAnalysisQuota } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // roadmap: 60s cap for the on-demand analysis

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let grantId: unknown;
  try {
    ({ grantId } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof grantId !== "string" || !grantId) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { allowed } = await consumeAnalysisQuota(supabase, user.id);
  if (!allowed) {
    return Response.json(
      { error: "Hai raggiunto il limite orario di analisi. Riprova più tardi." },
      { status: 429 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  // Silent upgrade to the strong analysis (spec §1): if this grant already has ready extracted
  // documents (from a prior /api/ai/strong/prepare), fold their text in — same route, same
  // schema, richer input. No documents yet -> byte-identical to today's quick analysis.
  const { data: docRows } = await supabase
    .from("grant_documents")
    .select("attachment_url, extracted_text")
    .eq("grant_id", grantId)
    .eq("status", "ready");
  const documents: DocumentText[] = (docRows ?? [])
    .filter((d): d is { attachment_url: string; extracted_text: string } => Boolean(d.extracted_text))
    .map((d) => ({
      title: view.grant.attachments.find((a) => a.url === d.attachment_url)?.title ?? d.attachment_url,
      text: d.extracted_text,
    }));

  const row = profile as ProfileRow;
  try {
    const analysis = await analyzeGrant(
      getProvider(process.env),
      {
        profile: rowToEntityProfile(row),
        name: row.name,
        activityDescription: row.activity_description,
      },
      view.grant,
      view.providerName,
      documents,
    );
    return Response.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/analyze] failed:", msg);
    const isRateLimit = msg.includes("429");
    return Response.json(
      {
        error: isRateLimit
          ? "Il provider AI ha raggiunto il limite di richieste. Riprova tra qualche minuto."
          : "Analisi non riuscita. Riprova tra qualche istante.",
      },
      { status: isRateLimit ? 429 : 502 },
    );
  }
}
```

- [ ] **Step 4: Eseguire tutti i test della route per verificarli passare**

Run: `cd app && npx vitest run src/app/api/ai/__tests__/analyze-route.test.ts`
Expected: PASS (4 test — i 3 preesistenti + il nuovo).

- [ ] **Step 5: Typecheck e suite completa**

Run: `cd app && npx tsc --noEmit && npm test`
Expected: nessun errore, tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api/ai/analyze/route.ts app/src/app/api/ai/__tests__/analyze-route.test.ts
git commit -m "feat(ai): /api/ai/analyze upgrades silently to the strong analysis when PDFs are ready"
```

---

## Task 7: Verifica finale + documentazione

**Files:** nessuna modifica di codice — solo verifica.

- [ ] **Step 1: Suite completa app + scraper**

Run: `cd app && npx tsc --noEmit && npm test && cd ../scraper && npm run typecheck`
Expected: tutto verde.

- [ ] **Step 2: Commit del piano**

```bash
git add docs/superpowers/plans/2026-07-21-strong-ai-v1-04-strong-analysis.md
git commit -m "docs(plan): strong AI analysis V1 — plan 4/6 (strong analysis + prepare/status)"
```

---

## Self-Review (Piano 4)

- **Copertura spec:** §1 (due tier, stesso schema) → Task 1 + Task 6 (nessuna nuova route di
  generazione, upgrade silenzioso). §2 (trigger on-demand condiviso, primo utente innesca) →
  Task 4 (entitlement consumato solo su righe nuove). §7 (scrittura `grant_documents` solo
  service_role) → Task 4 usa `createAdminClient`, Task 5 legge con il client utente (RLS
  permette select). §9 (stati UI) → `deriveReadiness` (Task 2) copre tutti e 6 gli stati incluso
  `no_documents` (bando senza allegati) e `ready_partial` (fallimento parziale). Coperto.
- **Fuori scope (corretto):** chat (Piano 5), componenti UI/polling client-side (Piano 6).
- **Placeholder:** nessun TBD; codice e test completi in ogni step.
- **Consistenza tipi:** `DocumentText` usato identico in `analyze-grant.ts`, nella route
  `analyze` e nel test. `ReadinessState`/`deriveReadiness` usati identici in `document-readiness.ts`
  e nelle due route `strong/*`. Le colonne lette/scritte (`attachment_url`, `status`,
  `extracted_text`) combaciano con lo schema di `grant_documents` (migration 0014).
