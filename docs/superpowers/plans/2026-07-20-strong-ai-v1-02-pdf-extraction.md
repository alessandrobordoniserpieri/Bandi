# Analisi AI forte V1 — Piano 2: Estrazione PDF + seam OCR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il motore di estrazione del testo dei PDF di un bando — libreria per il layer
di testo, rasterizzazione + OCR come fallback per gli scansionati — come libreria isolata e
testata, dietro i seam `OcrProvider` e `PdfTextExtractor`, senza ancora cablarla ad alcun
endpoint o tabella.

**Architecture:** Un nuovo modulo app `app/src/lib/extraction/` (peer di `app/src/lib/ai/`, dove
vive già il seam `checkEntitlement` del Piano 1). L'orchestratore `PdfTextExtractor` riceve per
dependency-injection quattro seam — `download`, `extractTextLayer`, `rasterize`, `ocr` — così la
sua logica (layer di testo → se scansionato, rasterizza + OCR pagina-per-pagina, con successo
parziale e errori tipizzati) è interamente unit-testabile con fake, mentre le integrazioni reali
fragili (unpdf, @napi-rs/canvas, OCR.space) sono thin e testate a parte con fixture. Il seam
`OcrProvider` + factory `getOcrProvider(env)` + `FakeOcrProvider` ricalca 1:1 il pattern
`LLMProvider`/`getProvider`/`FakeLLMProvider` già in `scraper/src/providers/`.

**Tech Stack:** TypeScript, vitest (app), `unpdf` (MIT, wrappa pdf.js Apache-2.0) per testo e
rasterizzazione, `@napi-rs/canvas` (MIT, backend canvas nativo prebuilt per pdf.js in Node/Vercel),
`sharp` (Apache-2.0, **già installato**) per tenere ogni PNG sotto il limite OCR, OCR.space (free
tier, seam `OcrProvider`), `pdf-lib` (MIT, **solo devDependency** per sintetizzare i PDF di fixture
nei test).

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- **Solo licenze permissive** (MIT/Apache/BSD). **Vietate AGPL/GPL** (contaminerebbero il SaaS
  proprietario). In particolare **MuPDF.js è AGPL → NON usarlo**, per quanto tecnicamente comodo.
  Librerie approvate qui: `unpdf` (MIT), `@napi-rs/canvas` (MIT), `sharp` (Apache-2.0), `pdf-lib`
  (MIT, dev-only).
- Next.js 16 (breaking changes vs training data) — leggere `app/node_modules/next/dist/docs/`
  (o la doc ufficiale della versione installata, `next@16.2.10`) **prima** di toccare
  `next.config.ts`; verificare lì il nome esatto della chiave di config per i pacchetti esterni al
  bundle server (`serverExternalPackages` in Next 15+).
- Le dipendenze native/prebuilt che pdf.js usa in Node (`@napi-rs/canvas`) vanno **escluse dal
  bundling** di Next (`serverExternalPackages`), altrimenti il build/deploy fallisce nel tracciare
  il binario `.node`.
- Pattern seam del repo (da `scraper/src/providers/`): interfaccia + provider concreto + factory
  `getX(env)` che seleziona da una env var + `FakeX` per i test. Errori tipizzati con flag
  `retryable`. Dipendenze HTTP/di libreria iniettate nel costruttore per la testabilità.
- **Lo scraper NON tocca `grant_documents`** (spec §7): questo modulo è consumato solo dall'app;
  lo scraper non lo importa. Nessun accoppiamento nuovo nel pipeline di scraping.
- Build e test **non** richiedono la chiave OCR reale né che alcun cron sia acceso: i test usano
  `FakeOcrProvider` (spec §3, §4).
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md`
  (§4 motore di estrazione, §7 modello dati per-documento, §9 fallimento totale/parziale).

---

## Dove si colloca nella roadmap (6 piani)

1. Fondamenta dati + entitlement — **FATTO** (PR #59).
2. **Estrazione PDF + seam OCR** ← *questo piano*. Libreria isolata e testata. Nessun endpoint/DB.
3. Worker asincrono di estrazione — consuma `createDefaultExtractor(env).extract(url)` per riga
   `grant_documents` pending; scrive `extracted_text`/`status`/`ocr_used`/`error`. Cron spento di
   default.
4. Analisi forte (generazione). 5. Chat backend. 6. UI.

---

## File Structure (Piano 2)

Tutto sotto `app/src/lib/extraction/`:

- Create `types.ts` — `OcrProvider`, `ExtractionError` (+ `ExtractionErrorCode`), `ExtractedDoc`,
  `FetchImpl`. Nessuna logica, solo contratti condivisi tra i file.
- Create `download.ts` — `downloadPdf(url, opts?)`: scarica i byte, guardie (HTTP, content non-PDF,
  cap dimensione), errori tipizzati. Seam di fetch iniettabile.
- Create `ocr/ocr-space.ts` — `OcrSpaceProvider implements OcrProvider` (HTTP reale a OCR.space,
  guardia 1 MB, mappatura risposta/errori).
- Create `ocr/fake.ts` — `FakeOcrProvider` per i test.
- Create `ocr/index.ts` — `getOcrProvider(env)` factory (default `ocrspace`).
- Create `pdf-text.ts` — `extractTextLayer(pdfBytes)`: layer di testo via unpdf; rileva PDF cifrato.
- Create `rasterize.ts` — `rasterizePdf(pdfBytes, opts?)`: pagine → PNG via unpdf+@napi-rs/canvas,
  ricompressione sharp sotto 1 MB.
- Create `pdf-text-extractor.ts` — `PdfTextExtractor` orchestratore (seam iniettati) +
  `createDefaultExtractor(env)`.
- Create `index.ts` — superficie pubblica del modulo (consumata dal worker del Piano 3).
- Create `__tests__/*.test.ts` — un file di test per unità.
- Modify `app/next.config.ts` — `serverExternalPackages`.
- Modify `app/package.json` — dipendenze (via `npm install`).
- Create `docs/onboarding/ocr-space-api-key.md` — guida passo-passo alla key gratuita (spec §4 nota).

---

## Task 1: Dipendenze, config Next, tipi condivisi

**Files:**
- Modify: `app/package.json` (via `npm install`)
- Modify: `app/next.config.ts`
- Create: `app/src/lib/extraction/types.ts`
- Test: `app/src/lib/extraction/__tests__/errors.test.ts`

**Interfaces:**
- Produces (consumati da tutti i task successivi):
  - `type ExtractionErrorCode = "download_failed" | "not_pdf" | "too_large" | "encrypted" | "no_text" | "ocr_failed"`
  - `class ExtractionError extends Error { readonly code: ExtractionErrorCode; readonly retryable: boolean }`
  - `interface ExtractedDoc { text: string; ocrUsed: boolean }`
  - `interface OcrProvider { readonly name: string; ocr(image: Uint8Array): Promise<string> }`
  - `type FetchImpl = typeof fetch` (l'app ha la lib DOM, quindi si usa il tipo globale; i test
    passano un fake con `as unknown as FetchImpl`).

- [ ] **Step 1: Installare le dipendenze**

Spiegazione: `unpdf` estrae testo e rasterizza (wrappa pdf.js); `@napi-rs/canvas` è il backend
canvas nativo che pdf.js richiede in Node per il rendering; `pdf-lib` serve **solo ai test** per
generare PDF di fixture. `sharp` è già presente. Dal root del repo (monorepo con workspaces):

Run:
```bash
cd /workspaces/Bandi
npm install unpdf @napi-rs/canvas --workspace app
npm install pdf-lib --save-dev --workspace app
```
Expected: `app/package.json` elenca `unpdf` e `@napi-rs/canvas` in `dependencies` e `pdf-lib` in
`devDependencies`; nessun errore di installazione.

- [ ] **Step 2: Escludere il canvas nativo dal bundle Next**

Prima leggere la doc Next della versione installata per confermare la chiave (regola del repo).
Poi modificare `app/next.config.ts`, aggiungendo `serverExternalPackages` all'oggetto config:

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ["bandi-scraper"],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // pdf.js (via unpdf) renders through @napi-rs/canvas, a native prebuilt addon. Native modules
  // must NOT be bundled: Next has to resolve them at runtime from node_modules and trace the
  // `.node` binary into the deployment. Listing them here does exactly that. `unpdf` is also
  // externalized so its bundled pdf.js worker isn't mangled by the bundler.
  serverExternalPackages: ["@napi-rs/canvas", "unpdf"],
};
```
Expected: file valido, `serverExternalPackages` presente accanto agli altri campi.

- [ ] **Step 3: Scrivere il test dei tipi/errori**

Create `app/src/lib/extraction/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ExtractionError } from "../types";

describe("ExtractionError", () => {
  it("carries a typed code and a retryable flag, defaulting retryable to false", () => {
    const e = new ExtractionError("download_failed", "boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("download_failed");
    expect(e.retryable).toBe(false);
    expect(e.name).toBe("ExtractionError");
  });

  it("preserves an explicit retryable flag and message", () => {
    const e = new ExtractionError("ocr_failed", "ocrspace: HTTP 500", { retryable: true });
    expect(e.retryable).toBe(true);
    expect(e.message).toBe("ocrspace: HTTP 500");
  });
});
```

- [ ] **Step 4: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/errors.test.ts`
Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 5: Scrivere `types.ts`**

Create `app/src/lib/extraction/types.ts`:

```typescript
// app/src/lib/extraction/types.ts
// Shared contracts for the strong-analysis PDF extraction engine (spec §4). No logic here.

// Typed failure modes. `retryable` distinguishes transient faults (network/5xx/429 → worth a
// later retry by the worker) from permanent ones (encrypted PDF, no extractable text → give up
// honestly, spec §9). The worker (Plan 3) maps these onto grant_documents.status/error.
export type ExtractionErrorCode =
  | "download_failed" // network / timeout / HTTP error fetching the file
  | "not_pdf"         // fetched bytes are not a PDF
  | "too_large"       // exceeds our download or per-image size cap
  | "encrypted"       // password-protected PDF, cannot read
  | "no_text"         // neither the text layer nor OCR produced usable text
  | "ocr_failed";     // OCR provider hard failure

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly retryable: boolean;
  constructor(
    code: ExtractionErrorCode,
    message: string,
    opts?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ExtractionError";
    this.code = code;
    this.retryable = opts?.retryable ?? false;
  }
}

// Result of extracting one attachment. `ocrUsed` tells the UI whether the text came from the
// PDF's own text layer or from OCR of a scanned document (spec §7 `ocr_used`).
export interface ExtractedDoc {
  text: string;
  ocrUsed: boolean;
}

// The OCR seam (spec §4): image bytes in, plain text out. Default impl OcrSpaceProvider; swappable
// behind this interface with zero changes to PdfTextExtractor. Mirrors LLMProvider in the scraper.
export interface OcrProvider {
  readonly name: string;
  ocr(image: Uint8Array): Promise<string>;
}

// Injected fetch seam. The app has the DOM lib, so the global `fetch` type is available; tests
// pass a fake cast via `as unknown as FetchImpl`.
export type FetchImpl = typeof fetch;
```

- [ ] **Step 6: Eseguire il test per verificarlo passare + typecheck**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/errors.test.ts && npx tsc --noEmit`
Expected: PASS (2 test); nessun errore di tipo.

- [ ] **Step 7: Commit**

```bash
git add app/package.json package-lock.json app/next.config.ts app/src/lib/extraction/types.ts app/src/lib/extraction/__tests__/errors.test.ts
git commit -m "feat(extraction): deps + Next external packages + typed extraction contracts"
```

---

## Task 2: `downloadPdf` — scarico byte con guardie

**Files:**
- Create: `app/src/lib/extraction/download.ts`
- Test: `app/src/lib/extraction/__tests__/download.test.ts`

**Interfaces:**
- Consumes: `ExtractionError`, `FetchImpl` (Task 1).
- Produces: `async function downloadPdf(url: string, opts?: { fetchImpl?: FetchImpl; maxBytes?: number; timeoutMs?: number }): Promise<Uint8Array>`.

- [ ] **Step 1: Scrivere i test (fake fetch)**

Create `app/src/lib/extraction/__tests__/download.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { downloadPdf } from "../download";
import { ExtractionError, type FetchImpl } from "../types";

// Minimal fake of the fetch Response subset downloadPdf uses.
function fakeFetch(res: { ok?: boolean; status?: number; body?: Uint8Array }): FetchImpl {
  const bytes = res.body ?? new TextEncoder().encode("%PDF-1.4\n...");
  return (async () => ({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => "detail",
  })) as unknown as FetchImpl;
}

describe("downloadPdf", () => {
  it("returns the bytes for a 200 response that looks like a PDF", async () => {
    const out = await downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({}) });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(out).startsWith("%PDF-")).toBe(true);
  });

  it("throws a RETRYABLE download_failed on 5xx", async () => {
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ ok: false, status: 503 }) }))
      .rejects.toMatchObject({ code: "download_failed", retryable: true });
  });

  it("throws a NON-retryable download_failed on 404", async () => {
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ ok: false, status: 404 }) }))
      .rejects.toMatchObject({ code: "download_failed", retryable: false });
  });

  it("throws not_pdf when the bytes are not a PDF", async () => {
    const html = new TextEncoder().encode("<!doctype html><html>404</html>");
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ body: html }) }))
      .rejects.toMatchObject({ code: "not_pdf" });
  });

  it("throws too_large when the file exceeds maxBytes", async () => {
    const big = new Uint8Array(10 + 5).fill(0x20);
    big.set(new TextEncoder().encode("%PDF-1.4"), 0);
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ body: big }), maxBytes: 8 }))
      .rejects.toMatchObject({ code: "too_large" });
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/download.test.ts`
Expected: FAIL — `Cannot find module '../download'`.

- [ ] **Step 3: Scrivere `download.ts`**

Create `app/src/lib/extraction/download.ts`:

```typescript
// app/src/lib/extraction/download.ts
// Fetches an attachment's bytes with defensive guards. Attachments are third-party URLs
// (grants.attachments), so anything can come back: 404 HTML, giant files, non-PDFs. Every bad
// outcome is a typed ExtractionError; transient ones (network/timeout/5xx/429) are retryable.
import { ExtractionError, type FetchImpl } from "./types";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB: generous for a bando PDF, blocks abuse.
const DEFAULT_TIMEOUT_MS = 30_000;

export async function downloadPdf(
  url: string,
  opts: { fetchImpl?: FetchImpl; maxBytes?: number; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    throw new ExtractionError("download_failed", "download: errore di rete o timeout", { retryable: true, cause });
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ExtractionError("download_failed", `download: HTTP ${res.status}`, { retryable: true });
  }
  if (!res.ok) {
    throw new ExtractionError("download_failed", `download: HTTP ${res.status}`, { retryable: false });
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new ExtractionError("too_large", `download: file oltre ${maxBytes} byte`, { retryable: false });
  }
  // PDF magic: "%PDF-" appears at (or very near) the start. Decode a small head window as latin1
  // so raw bytes map 1:1 to chars; tolerate a leading BOM/whitespace.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    throw new ExtractionError("not_pdf", "download: il contenuto non è un PDF", { retryable: false });
  }
  return bytes;
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/download.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/extraction/download.ts app/src/lib/extraction/__tests__/download.test.ts
git commit -m "feat(extraction): downloadPdf with typed guards (HTTP/size/magic)"
```

---

## Task 3: Seam OCR — `OcrSpaceProvider`, `FakeOcrProvider`, `getOcrProvider`

**Files:**
- Create: `app/src/lib/extraction/ocr/ocr-space.ts`
- Create: `app/src/lib/extraction/ocr/fake.ts`
- Create: `app/src/lib/extraction/ocr/index.ts`
- Test: `app/src/lib/extraction/__tests__/ocr-space.test.ts`

**Interfaces:**
- Consumes: `OcrProvider`, `ExtractionError`, `FetchImpl` (Task 1).
- Produces:
  - `class OcrSpaceProvider implements OcrProvider` — costruttore `{ apiKey: string; endpoint?: string; language?: string; engine?: number; timeoutMs?: number; fetchImpl?: FetchImpl }`.
  - `class FakeOcrProvider implements OcrProvider` — costruttore `(responses: Map<...>|string, ...)`; usato dai test del Task 6.
  - `function getOcrProvider(env?: Record<string, string | undefined>): OcrProvider` — default `ocrspace`.

- [ ] **Step 1: Scrivere i test (fake fetch)**

Create `app/src/lib/extraction/__tests__/ocr-space.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { OcrSpaceProvider } from "../ocr/ocr-space";
import { getOcrProvider } from "../ocr/index";
import type { FetchImpl } from "../types";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeFetch(payload: {
  ok?: boolean; status?: number; json?: unknown;
}): { impl: FetchImpl; calls: number } {
  const box = { calls: 0 };
  const impl = (async () => {
    box.calls += 1;
    return {
      ok: payload.ok ?? true,
      status: payload.status ?? 200,
      json: async () => payload.json ?? { ParsedResults: [{ ParsedText: "" }], OCRExitCode: 1, IsErroredOnProcessing: false },
      text: async () => "err",
    };
  }) as unknown as FetchImpl;
  return { impl, get calls() { return box.calls; } } as { impl: FetchImpl; calls: number };
}

describe("OcrSpaceProvider", () => {
  it("joins ParsedText from a successful response", async () => {
    const f = fakeFetch({ json: { ParsedResults: [{ ParsedText: "Riga uno" }, { ParsedText: "Riga due" }], OCRExitCode: 1, IsErroredOnProcessing: false } });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    expect(await p.ocr(PNG)).toBe("Riga uno\nRiga due");
  });

  it("throws a NON-retryable ocr_failed when IsErroredOnProcessing is true", async () => {
    const f = fakeFetch({ json: { IsErroredOnProcessing: true, ErrorMessage: ["timeout"] } });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    await expect(p.ocr(PNG)).rejects.toMatchObject({ code: "ocr_failed", retryable: false });
  });

  it("throws a RETRYABLE ocr_failed on HTTP 429/5xx", async () => {
    const f = fakeFetch({ ok: false, status: 429 });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    await expect(p.ocr(PNG)).rejects.toMatchObject({ code: "ocr_failed", retryable: true });
  });

  it("rejects an image over 1 MB WITHOUT calling the API (free-tier limit)", async () => {
    const f = fakeFetch({});
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    const big = new Uint8Array(1024 * 1024 + 1);
    await expect(p.ocr(big)).rejects.toMatchObject({ code: "too_large" });
    expect(f.calls).toBe(0);
  });
});

describe("getOcrProvider", () => {
  it("returns an OcrSpaceProvider when OCR_SPACE_API_KEY is set", () => {
    const p = getOcrProvider({ OCR_SPACE_API_KEY: "k" });
    expect(p.name).toBe("ocrspace");
  });
  it("throws a helpful error when the key is missing", () => {
    expect(() => getOcrProvider({})).toThrow(/OCR_SPACE_API_KEY/);
  });
  it("throws on an unknown OCR_PROVIDER", () => {
    expect(() => getOcrProvider({ OCR_PROVIDER: "nope", OCR_SPACE_API_KEY: "k" })).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/ocr-space.test.ts`
Expected: FAIL — `Cannot find module '../ocr/ocr-space'`.

- [ ] **Step 3: Scrivere `ocr/ocr-space.ts`**

Create `app/src/lib/extraction/ocr/ocr-space.ts`:

```typescript
// app/src/lib/extraction/ocr/ocr-space.ts
// Default OcrProvider: OCR.space free tier (spec §4). We send ONE rasterized page image per call
// as base64; the free tier caps files at 1 MB (enforced here defensively) and 25k req/month, so
// the caller rasterizes page-by-page rather than posting whole PDFs. NO LLM is used for OCR
// (explicit spec decision). Swappable behind the OcrProvider seam.
import { ExtractionError, type FetchImpl, type OcrProvider } from "../types";

const DEFAULT_ENDPOINT = "https://api.ocr.space/parse/image";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 1024 * 1024; // OCR.space free tier: 1 MB per file.

interface OcrSpaceResponse {
  ParsedResults?: Array<{ ParsedText?: string; FileParseExitCode?: number; ErrorMessage?: string | null }>;
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
}

export interface OcrSpaceConfig {
  apiKey: string;
  endpoint?: string;
  language?: string;   // three-letter code; Italian bandi → "ita".
  engine?: number;     // OCR.space engine 1|2|3; 1 is the free default.
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}

export class OcrSpaceProvider implements OcrProvider {
  readonly name = "ocrspace";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly language: string;
  private readonly engine: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImpl;

  constructor(config: OcrSpaceConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.language = config.language ?? "ita";
    this.engine = config.engine ?? 1;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async ocr(image: Uint8Array): Promise<string> {
    if (image.byteLength > MAX_IMAGE_BYTES) {
      throw new ExtractionError("too_large", `ocrspace: immagine oltre 1 MB (${image.byteLength} byte)`, { retryable: false });
    }
    const base64 = Buffer.from(image).toString("base64");
    const form = new URLSearchParams({
      base64Image: `data:image/png;base64,${base64}`,
      language: this.language,
      OCREngine: String(this.engine),
      isOverlayRequired: "false",
      scale: "true",
    });

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { apikey: this.apiKey, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new ExtractionError("ocr_failed", "ocrspace: errore di rete o timeout", { retryable: true, cause });
    }
    if (res.status === 429 || res.status >= 500) {
      throw new ExtractionError("ocr_failed", `ocrspace: HTTP ${res.status}`, { retryable: true });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ExtractionError("ocr_failed", `ocrspace: HTTP ${res.status} ${detail}`.trim(), { retryable: false });
    }

    const body = (await res.json()) as OcrSpaceResponse;
    if (body.IsErroredOnProcessing) {
      const msg = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join("; ") : body.ErrorMessage ?? "errore sconosciuto";
      throw new ExtractionError("ocr_failed", `ocrspace: ${msg}`, { retryable: false });
    }
    return (body.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").trim();
  }
}
```

- [ ] **Step 4: Scrivere `ocr/fake.ts`**

Create `app/src/lib/extraction/ocr/fake.ts`:

```typescript
// app/src/lib/extraction/ocr/fake.ts
// Deterministic OcrProvider for tests (mirrors FakeLLMProvider). Either returns a fixed string
// for every image, or a queued sequence (one per page), or throws a supplied error.
import type { OcrProvider } from "../types";

export class FakeOcrProvider implements OcrProvider {
  readonly name = "fake-ocr";
  private queue: Array<string | Error>;
  constructor(private readonly responses: string | Array<string | Error>) {
    this.queue = Array.isArray(responses) ? [...responses] : [];
  }
  async ocr(_image: Uint8Array): Promise<string> {
    if (typeof this.responses === "string") return this.responses;
    const next = this.queue.shift();
    if (next === undefined) return "";
    if (next instanceof Error) throw next;
    return next;
  }
}
```

- [ ] **Step 5: Scrivere `ocr/index.ts` (factory)**

Create `app/src/lib/extraction/ocr/index.ts`:

```typescript
// app/src/lib/extraction/ocr/index.ts
// Selects the OCR adapter from OCR_PROVIDER (default "ocrspace"), mirroring getProvider for LLMs.
// Adding a provider (e.g. Google Cloud Vision) = a new case here + its adapter, nothing else.
import type { OcrProvider } from "../types";
import { OcrSpaceProvider } from "./ocr-space";

export { OcrSpaceProvider } from "./ocr-space";
export { FakeOcrProvider } from "./fake";

export function getOcrProvider(env: Record<string, string | undefined> = process.env): OcrProvider {
  const name = (env.OCR_PROVIDER ?? "ocrspace").trim().toLowerCase();
  if (name !== "ocrspace") {
    throw new Error(`OCR_PROVIDER sconosciuto: "${name}". Valori validi: ocrspace.`);
  }
  const apiKey = env.OCR_SPACE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Chiave OCR mancante: imposta OCR_SPACE_API_KEY (registrazione gratuita su https://ocr.space/ocrapi).',
    );
  }
  return new OcrSpaceProvider({ apiKey, ...(env.OCR_SPACE_LANGUAGE ? { language: env.OCR_SPACE_LANGUAGE } : {}) });
}
```

- [ ] **Step 6: Eseguire i test per verificarli passare + typecheck**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/ocr-space.test.ts && npx tsc --noEmit`
Expected: PASS (7 test); nessun errore di tipo.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/extraction/ocr app/src/lib/extraction/__tests__/ocr-space.test.ts
git commit -m "feat(extraction): OcrProvider seam — OcrSpaceProvider + fake + getOcrProvider factory"
```

---

## Task 4: `extractTextLayer` — layer di testo via unpdf

**Files:**
- Create: `app/src/lib/extraction/pdf-text.ts`
- Test: `app/src/lib/extraction/__tests__/pdf-text.test.ts`

**Interfaces:**
- Consumes: `ExtractionError` (Task 1), `unpdf`, `pdf-lib` (dev, per la fixture).
- Produces: `async function extractTextLayer(pdfBytes: Uint8Array): Promise<string>` — testo unito e
  trimmato; `""` se il PDF non ha layer di testo (scansionato); **throw** `encrypted` se cifrato.

- [ ] **Step 1: Scrivere il test di integrazione (fixture pdf-lib)**

Create `app/src/lib/extraction/__tests__/pdf-text.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractTextLayer } from "../pdf-text";

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  lines.forEach((line, i) => page.drawText(line, { x: 20, y: 160 - i * 20, size: 14, font }));
  return doc.save();
}

describe("extractTextLayer", () => {
  it("returns the text layer of a born-digital PDF", async () => {
    const bytes = await textPdf(["Bando ETS 2026", "Contributo terzo settore"]);
    const text = await extractTextLayer(bytes);
    expect(text).toContain("Bando ETS 2026");
    expect(text).toContain("Contributo terzo settore");
  });

  it("returns an empty string for a PDF with no text layer (scanned-like)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]); // page with no drawn text
    const text = await extractTextLayer(await doc.save());
    expect(text).toBe("");
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/pdf-text.test.ts`
Expected: FAIL — `Cannot find module '../pdf-text'`.

- [ ] **Step 3: Scrivere `pdf-text.ts`**

Create `app/src/lib/extraction/pdf-text.ts`:

```typescript
// app/src/lib/extraction/pdf-text.ts
// Step 1 of extraction (spec §4): pull the PDF's own text layer via unpdf (serverless pdf.js).
// Works for the majority of bandi (Word-generated PDFs). A scanned PDF parses fine but yields an
// empty/near-empty layer → the caller falls back to OCR. A password-protected PDF can't be read
// at all → typed `encrypted` error (permanent).
import { extractText, getDocumentProxy } from "unpdf";
import { ExtractionError } from "./types";

export async function extractTextLayer(pdfBytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(pdfBytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  } catch (cause) {
    if (isEncrypted(cause)) {
      throw new ExtractionError("encrypted", "pdf: documento protetto da password", { retryable: false });
    }
    // Corrupt / unreadable structure: not retryable, and rasterization would fail too.
    throw new ExtractionError("no_text", "pdf: layer di testo illeggibile", { retryable: false, cause });
  }
}

function isEncrypted(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("password") || msg.includes("encrypt");
}
```

- [ ] **Step 4: Eseguire il test per verificarlo passare**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/pdf-text.test.ts`
Expected: PASS (2 test). (Se pdf.js emette warning su stderr durante il parse è normale.)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/extraction/pdf-text.ts app/src/lib/extraction/__tests__/pdf-text.test.ts
git commit -m "feat(extraction): extractTextLayer via unpdf (text layer + encrypted detection)"
```

---

## Task 5: `rasterizePdf` — pagine → PNG sotto 1 MB

**Files:**
- Create: `app/src/lib/extraction/rasterize.ts`
- Test: `app/src/lib/extraction/__tests__/rasterize.test.ts`

**Interfaces:**
- Consumes: `unpdf` (`getDocumentProxy`, `renderPageAsImage`), `@napi-rs/canvas` (via `canvasImport`),
  `sharp`, `pdf-lib` (dev, fixture).
- Produces: `async function rasterizePdf(pdfBytes: Uint8Array, opts?: { maxPages?: number; targetWidth?: number }): Promise<Uint8Array[]>`
  — un PNG (Uint8Array) per pagina, ciascuno ≤ 1 MB, al più `maxPages` pagine.

- [ ] **Step 1: Scrivere il test di integrazione (fixture multipagina)**

Create `app/src/lib/extraction/__tests__/rasterize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { rasterizePdf } from "../rasterize";

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]);
  return doc.save();
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // ‰PNG

describe("rasterizePdf", () => {
  it("renders one PNG per page, each a valid PNG under 1 MB", async () => {
    const images = await rasterizePdf(await blankPdf(2));
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img).toBeInstanceOf(Uint8Array);
      expect([...img.subarray(0, 4)]).toEqual(PNG_MAGIC);
      expect(img.byteLength).toBeLessThanOrEqual(1024 * 1024);
    }
  });

  it("caps the number of rendered pages at maxPages", async () => {
    const images = await rasterizePdf(await blankPdf(5), { maxPages: 3 });
    expect(images).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/rasterize.test.ts`
Expected: FAIL — `Cannot find module '../rasterize'`.

- [ ] **Step 3: Scrivere `rasterize.ts`**

Create `app/src/lib/extraction/rasterize.ts`:

```typescript
// app/src/lib/extraction/rasterize.ts
// Step 2 of extraction (spec §4), the scanned-PDF fallback: render each page to a PNG so it can be
// OCR'd. unpdf drives pdf.js; in Node pdf.js renders through @napi-rs/canvas (native prebuilt,
// passed via canvasImport). Each PNG must stay under OCR.space's 1 MB free-tier cap, so we re-encode
// oversized pages smaller with sharp. maxPages bounds cost/time on huge documents.
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import sharp from "sharp";

const DEFAULT_TARGET_WIDTH = 1654; // ~200 DPI across an A4 width — enough for OCR, modest size.
const DEFAULT_MAX_PAGES = 25;
const MAX_IMAGE_BYTES = 1024 * 1024;

export async function rasterizePdf(
  pdfBytes: Uint8Array,
  opts: { maxPages?: number; targetWidth?: number } = {},
): Promise<Uint8Array[]> {
  const targetWidth = opts.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  const pdf = await getDocumentProxy(pdfBytes);
  const pageCount = Math.min(pdf.numPages, maxPages);

  const images: Uint8Array[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const rendered = await renderPageAsImage(pdf, page, {
      canvasImport: () => import("@napi-rs/canvas"),
      width: targetWidth,
    });
    images.push(await capImageSize(new Uint8Array(rendered)));
  }
  return images;
}

// Guarantees a PNG under MAX_IMAGE_BYTES by shrinking width until it fits (or bottoms out). A page
// still over the cap after this is handed to OcrSpaceProvider, which rejects it (too_large) — that
// single page is then skipped as a partial failure rather than sinking the whole document.
async function capImageSize(png: Uint8Array): Promise<Uint8Array> {
  if (png.byteLength <= MAX_IMAGE_BYTES) return png;
  let width = 1400;
  let out = png;
  for (let attempt = 0; attempt < 4; attempt++) {
    out = new Uint8Array(await sharp(png).resize({ width }).png({ compressionLevel: 9 }).toBuffer());
    if (out.byteLength <= MAX_IMAGE_BYTES) return out;
    width = Math.round(width * 0.8);
  }
  return out;
}
```

- [ ] **Step 4: Eseguire il test per verificarlo passare**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/rasterize.test.ts`
Expected: PASS (2 test). (Il primo run può essere lento: @napi-rs/canvas carica il binario nativo.)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/extraction/rasterize.ts app/src/lib/extraction/__tests__/rasterize.test.ts
git commit -m "feat(extraction): rasterizePdf (unpdf + @napi-rs/canvas) with 1MB sharp cap"
```

---

## Task 6: `PdfTextExtractor` — orchestratore (seam iniettati)

**Files:**
- Create: `app/src/lib/extraction/pdf-text-extractor.ts`
- Test: `app/src/lib/extraction/__tests__/pdf-text-extractor.test.ts`

**Interfaces:**
- Consumes: `OcrProvider`, `ExtractionError`, `ExtractedDoc` (Task 1); `FakeOcrProvider` (Task 3).
- Produces:
  - `interface PdfTextExtractorDeps { download: (url: string) => Promise<Uint8Array>; extractTextLayer: (bytes: Uint8Array) => Promise<string>; rasterize: (bytes: Uint8Array) => Promise<Uint8Array[]>; ocr: OcrProvider; minTextChars?: number }`
  - `class PdfTextExtractor { constructor(deps: PdfTextExtractorDeps); extract(attachmentUrl: string): Promise<ExtractedDoc> }`
  - `function createDefaultExtractor(env?: Record<string, string | undefined>): PdfTextExtractor` (definita qui, wirata nel Task 7 index).

- [ ] **Step 1: Scrivere i test dell'orchestratore (tutti fake)**

Create `app/src/lib/extraction/__tests__/pdf-text-extractor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PdfTextExtractor, type PdfTextExtractorDeps } from "../pdf-text-extractor";
import { FakeOcrProvider } from "../ocr/fake";
import { ExtractionError, type OcrProvider } from "../types";

const BYTES = new TextEncoder().encode("%PDF-1.4 fake");

function deps(over: Partial<PdfTextExtractorDeps> = {}): PdfTextExtractorDeps {
  return {
    download: async () => BYTES,
    extractTextLayer: async () => "",
    rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
    ocr: new FakeOcrProvider("pagina"),
    ...over,
  };
}

describe("PdfTextExtractor", () => {
  it("returns the text layer (ocrUsed=false) and never rasterizes when text is present", async () => {
    let rasterized = false;
    const ex = new PdfTextExtractor(deps({
      extractTextLayer: async () => "Un testo di bando sufficientemente lungo per superare la soglia.",
      rasterize: async () => { rasterized = true; return []; },
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "Un testo di bando sufficientemente lungo per superare la soglia.", ocrUsed: false });
    expect(rasterized).toBe(false);
  });

  it("falls back to OCR (ocrUsed=true) when the text layer is empty", async () => {
    const ex = new PdfTextExtractor(deps({
      rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
      ocr: new FakeOcrProvider(["pagina uno", "pagina due"]),
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "pagina uno\n\npagina due", ocrUsed: true });
  });

  it("tolerates a non-retryable per-page OCR failure (partial) and returns the rest", async () => {
    const ex = new PdfTextExtractor(deps({
      rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
      ocr: new FakeOcrProvider([new ExtractionError("too_large", "big"), "solo questa"]),
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "solo questa", ocrUsed: true });
  });

  it("throws no_text when neither the text layer nor OCR yields text", async () => {
    const ex = new PdfTextExtractor(deps({ ocr: new FakeOcrProvider("") }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "no_text" });
  });

  it("re-throws a RETRYABLE OCR outage so the worker can retry the whole document", async () => {
    const outage: OcrProvider = { name: "x", ocr: async () => { throw new ExtractionError("ocr_failed", "503", { retryable: true }); } };
    const ex = new PdfTextExtractor(deps({ ocr: outage }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "ocr_failed", retryable: true });
  });

  it("propagates a download failure", async () => {
    const ex = new PdfTextExtractor(deps({
      download: async () => { throw new ExtractionError("download_failed", "404"); },
    }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "download_failed" });
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/pdf-text-extractor.test.ts`
Expected: FAIL — `Cannot find module '../pdf-text-extractor'`.

- [ ] **Step 3: Scrivere `pdf-text-extractor.ts`**

Create `app/src/lib/extraction/pdf-text-extractor.ts`:

```typescript
// app/src/lib/extraction/pdf-text-extractor.ts
// Orchestrates extraction of ONE attachment (spec §4): download → text layer → if scanned,
// rasterize + OCR page-by-page. All four steps are injected seams, so this logic is unit-tested
// with fakes; the real wiring is createDefaultExtractor below. Errors are typed (ExtractionError):
// the worker (Plan 3) maps them onto grant_documents.status/error and aggregates the bando-level
// partial/total outcome (spec §9). Document-level partial (some pages OCR-fail) is handled here.
import { downloadPdf } from "./download";
import { extractTextLayer } from "./pdf-text";
import { rasterizePdf } from "./rasterize";
import { getOcrProvider } from "./ocr/index";
import { ExtractionError, type ExtractedDoc, type OcrProvider } from "./types";

export interface PdfTextExtractorDeps {
  download: (url: string) => Promise<Uint8Array>;
  extractTextLayer: (bytes: Uint8Array) => Promise<string>;
  rasterize: (bytes: Uint8Array) => Promise<Uint8Array[]>;
  ocr: OcrProvider;
  // Minimum chars in the text layer to treat a PDF as "born-digital" and skip OCR. Below this we
  // assume it's scanned. Default 40: a real bando page has hundreds; a scanned one ~0.
  minTextChars?: number;
}

export class PdfTextExtractor {
  private readonly minTextChars: number;
  constructor(private readonly deps: PdfTextExtractorDeps) {
    this.minTextChars = deps.minTextChars ?? 40;
  }

  async extract(attachmentUrl: string): Promise<ExtractedDoc> {
    const bytes = await this.deps.download(attachmentUrl);
    const layer = await this.deps.extractTextLayer(bytes);
    if (layer.length >= this.minTextChars) {
      return { text: layer, ocrUsed: false };
    }

    // Scanned / near-empty text layer → OCR each rendered page.
    const images = await this.deps.rasterize(bytes);
    const parts: string[] = [];
    for (const image of images) {
      try {
        const pageText = (await this.deps.ocr.ocr(image)).trim();
        if (pageText) parts.push(pageText);
      } catch (err) {
        // A transient OCR outage should retry the WHOLE document later, not silently drop pages.
        if (err instanceof ExtractionError && err.retryable) throw err;
        // A permanent per-page failure (e.g. too_large) → skip this page, keep the rest (partial).
      }
    }

    const ocrText = parts.join("\n\n").trim();
    if (ocrText.length > 0) return { text: ocrText, ocrUsed: true };
    throw new ExtractionError("no_text", "nessun testo estraibile (né layer né OCR)", { retryable: false });
  }
}

// Real wiring used by the worker (Plan 3): concrete download + text + rasterize + the env-selected
// OCR provider. Reads OCR_SPACE_API_KEY (see docs/onboarding/ocr-space-api-key.md).
export function createDefaultExtractor(
  env: Record<string, string | undefined> = process.env,
): PdfTextExtractor {
  return new PdfTextExtractor({
    download: (url) => downloadPdf(url),
    extractTextLayer,
    rasterize: (bytes) => rasterizePdf(bytes),
    ocr: getOcrProvider(env),
  });
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare + typecheck**

Run: `cd app && npx vitest run src/lib/extraction/__tests__/pdf-text-extractor.test.ts && npx tsc --noEmit`
Expected: PASS (6 test); nessun errore di tipo.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/extraction/pdf-text-extractor.ts app/src/lib/extraction/__tests__/pdf-text-extractor.test.ts
git commit -m "feat(extraction): PdfTextExtractor orchestrator (text→OCR fallback, partial handling)"
```

---

## Task 7: Superficie pubblica + onboarding OCR.space + verifica finale

**Files:**
- Create: `app/src/lib/extraction/index.ts`
- Create: `docs/onboarding/ocr-space-api-key.md`
- Modify: `.claude/CLAUDE.md` (sezione "Environment variables": aggiungere le env var OCR)

**Interfaces:**
- Produces: la superficie pubblica del modulo `@/lib/extraction`, consumata dal worker del Piano 3.

- [ ] **Step 1: Scrivere `index.ts` (barrel)**

Create `app/src/lib/extraction/index.ts`:

```typescript
// app/src/lib/extraction/index.ts
// Public surface of the PDF extraction engine, consumed by the strong-analysis worker (Plan 3).
export { PdfTextExtractor, createDefaultExtractor } from "./pdf-text-extractor";
export type { PdfTextExtractorDeps } from "./pdf-text-extractor";
export { downloadPdf } from "./download";
export { extractTextLayer } from "./pdf-text";
export { rasterizePdf } from "./rasterize";
export { getOcrProvider, OcrSpaceProvider, FakeOcrProvider } from "./ocr/index";
export { ExtractionError } from "./types";
export type { ExtractionErrorCode, ExtractedDoc, OcrProvider, FetchImpl } from "./types";
```

- [ ] **Step 2: Scrivere la guida di onboarding (spec §4 nota)**

Create `docs/onboarding/ocr-space-api-key.md`:

```markdown
# Onboarding: chiave OCR.space (gratuita) per l'analisi forte

L'estrazione dei PDF **scansionati** usa OCR.space come motore OCR di default (seam `OcrProvider`,
sostituibile). Serve una **chiave API gratuita**. Build e test NON la richiedono (usano un fake);
serve solo per far girare l'estrazione reale (Piano 3+).

## Passo-passo

1. Vai su **https://ocr.space/ocrapi** e clicca "Register for free API key".
2. Inserisci la tua email. Ricevi la chiave (una stringa) via email.
3. Aggiungi la chiave alle env var del progetto:
   - **In locale:** in `app/.env.local` aggiungi
     ```
     OCR_SPACE_API_KEY=la-tua-chiave
     ```
   - **Su Vercel:** Project → Settings → Environment Variables → aggiungi `OCR_SPACE_API_KEY`.
4. (Opzionale) `OCR_SPACE_LANGUAGE` (default `ita`) e `OCR_PROVIDER` (default `ocrspace`).

## Limiti del free tier (perché rasterizziamo pagina-per-pagina)

- **1 MB** per file → inviamo una immagine PNG per pagina, ricompressa sotto 1 MB (`rasterize.ts`).
- **25.000** richieste/mese, **500**/giorno per IP.
- Il cap giornaliero per-utente sull'estrazione (spec §8, ~15 bandi/giorno) tiene il volume basso.

## Migrazione futura (stesso seam)

Per più accuratezza si può passare a **Google Cloud Vision** (richiede progetto GCP + billing):
si aggiunge un adapter dietro `OcrProvider` e si cambia `OCR_PROVIDER`. Nessun altro codice cambia.
```

- [ ] **Step 3: Documentare le env var in `.claude/CLAUDE.md`**

Modify `/workspaces/Bandi/.claude/CLAUDE.md`, in fondo alla sezione "## Environment variables",
aggiungere:

```markdown
Analisi forte (estrazione OCR, opzionale — solo per l'estrazione reale, non per build/test):
`OCR_SPACE_API_KEY` (registrazione gratuita su https://ocr.space/ocrapi), `OCR_SPACE_LANGUAGE`
(default `ita`), `OCR_PROVIDER` (default `ocrspace`). Vedi `docs/onboarding/ocr-space-api-key.md`.
```

- [ ] **Step 4: Verifica finale — intera suite del modulo + typecheck**

Run: `cd app && npx vitest run src/lib/extraction && npx tsc --noEmit`
Expected: PASS (tutti i test del modulo: errors 2, download 5, ocr-space 7, pdf-text 2, rasterize 2,
pdf-text-extractor 6 = 24); nessun errore di tipo.

- [ ] **Step 5: Verifica di non-regressione — suite app completa**

Run: `cd app && npm test`
Expected: verde (i nuovi test passano, nessun test esistente si rompe).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/extraction/index.ts docs/onboarding/ocr-space-api-key.md .claude/CLAUDE.md
git commit -m "feat(extraction): public barrel + OCR.space onboarding + env docs"
```

- [ ] **Step 7 (guidato, interattivo): onboarding della chiave OCR con l'utente**

Come da spec §4 (nota di onboarding), l'agente esecutore **guida l'utente passo-passo** attraverso
`docs/onboarding/ocr-space-api-key.md` per ottenere e incollare la chiave. **Non è un blocco** per
completare il Piano 2 (build/test verdi senza chiave) — è il prerequisito per accendere
l'estrazione reale nel Piano 3.

---

## Self-Review (Piano 2)

- **Copertura spec §4 (motore di estrazione):** libreria per il testo → Task 4 (`extractTextLayer`,
  unpdf). Fallback rasterizzazione+OCR sugli scansionati → Task 5 (`rasterizePdf`) + Task 3
  (`OcrProvider`/`OcrSpaceProvider`). Seam OCR sostituibile + default OCR.space free → Task 3
  (factory `getOcrProvider`, adapter concreto). "NON si passa dall'LLM per l'OCR" → rispettato
  (nessun uso di `getProvider`/LLM qui). Nota onboarding passo-passo → Task 7 (doc + step guidato).
- **Copertura spec §7 (per-documento) / §9 (parziale/totale):** l'unità è il singolo `attachmentUrl`
  (`PdfTextExtractor.extract`), che ritorna `{text, ocrUsed}` o lancia `ExtractionError` tipizzato
  (`no_text` = fallimento totale del documento; il parziale a livello pagina è gestito nel loop
  OCR). L'aggregazione a livello bando (alcuni doc ok, altri no) è del worker (Piano 3), non qui.
- **Disaccoppiamento scraper (§7):** modulo in `app/src/lib/extraction/`, importato solo dall'app;
  lo scraper non lo tocca. Nessuna scrittura su `grant_documents` in questo piano.
- **Vincolo licenze:** tutte le librerie sono MIT/Apache (unpdf, @napi-rs/canvas, sharp, pdf-lib);
  **MuPDF (AGPL) esplicitamente escluso** nei Global Constraints.
- **Placeholder:** nessun TBD/TODO; ogni step ha codice completo (TS + test) e comandi con output
  atteso. Le firme unpdf (`extractText { mergePages:true }→{text}`, `renderPageAsImage(pdf,n,{canvasImport,width})→ArrayBuffer`)
  e la risposta OCR.space (`ParsedResults[].ParsedText`, `IsErroredOnProcessing`) sono verificate
  contro la documentazione live (2026-07-20).
- **Consistenza tipi:** `ExtractionError(code,message,{retryable,cause})`, `OcrProvider.ocr(Uint8Array)→Promise<string>`,
  `ExtractedDoc {text,ocrUsed}`, `PdfTextExtractorDeps {download,extractTextLayer,rasterize,ocr,minTextChars?}`
  usati identici tra i file e i loro test. Il cap 1 MB compare coerente in `ocr-space.ts` (guardia)
  e `rasterize.ts` (ricompressione).
- **Fuori scope (corretto):** worker/cron/DB (Piano 3), generazione analisi forte (Piano 4), chat
  (Piano 5), UI (Piano 6). Nessun endpoint né scrittura DB in questo piano.
```
