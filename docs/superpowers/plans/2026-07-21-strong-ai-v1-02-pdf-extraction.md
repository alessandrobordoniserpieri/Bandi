# Analisi AI forte V1 — Piano 2: Estrazione PDF + seam OCR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire `OcrProvider` (seam, default `OcrSpaceProvider`) e `PdfTextExtractor`
(libreria di estrazione testo → fallback OCR quando il PDF è scansionato), isolati e testabili
senza rete reale, pronti per essere orchestrati dal worker asincrono del Piano 3.

**Architecture:** Due seam indipendenti dietro interfacce, stesso pattern di `LLMProvider`
(`app/src/lib/ai/provider.ts`) e dei fake usati dallo scraper. `PdfTextExtractor.extract(url)`
scarica i byte del PDF, prova l'estrazione del layer testo con `unpdf` (libreria pura JS, zero
dipendenze native, adatta a Vercel serverless); se il testo estratto è sotto una soglia minima
(PDF scansionato, niente layer testo), passa i byte a `OcrProvider.ocr()`. Il provider OCR di
default (`OcrSpaceProvider`) invia il PDF **direttamente** (non rasterizzato in immagini) a
OCR.space, che accetta `filetype=PDF` nativamente — questo evita di introdurre una dipendenza di
rendering/canvas nel runtime serverless (rischio esplicitamente da evitare, vedi §Rischi della
spec) pur restando dietro lo stesso seam `OcrProvider.ocr(bytes, mimeType)`, quindi un provider
futuro (es. Google Cloud Vision, che vuole immagini) può rasterizzare internamente senza toccare
i chiamanti.

**Tech Stack:** TypeScript, `unpdf` (nuova dipendenza, zero dipendenze native), vitest, `fetch`/
`FormData`/`Blob` nativi (Next.js 16 / Node runtime).

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md` §4.
- **NON si passa dall'LLM per l'OCR** (decisione esplicita utente, spec §4).
- OCR di default: **OCR.space** (free tier). Il motore concreto è **swappable** dietro il seam
  `OcrProvider` — nessun altro modulo deve dipendere da OCR.space direttamente.
- Segue il pattern DI già in uso nel repo (`LLMProvider`, `PageFetcher`, `GrantsDb`): interfacce +
  implementazione reale + fake iniettabile per i test. Nessuna chiamata di rete reale nei test.
- File piatti in `app/src/lib/ai/` (segue la convenzione esistente: `provider.ts`,
  `entitlement.ts`, `analyze-grant.ts` — non introdurre una sottocartella).
- Questo piano **non** tocca DB, route, o worker — solo i due seam isolati (Piano 3 li orchestra).

---

## File Structure (Piano 2)

- Modify: `app/package.json` — aggiunge dipendenza `unpdf`.
- Create: `app/src/lib/ai/pdf-extraction-error.ts` — `PdfExtractionError` tipizzato.
- Create: `app/src/lib/ai/ocr-provider.ts` — `OcrProvider` (interfaccia), `OcrSpaceProvider`,
  `getOcrProvider()` (factory da env).
- Create: `app/src/lib/ai/pdf-text-extractor.ts` — `PdfTextExtractor` (interfaccia),
  `createPdfTextExtractor()`.
- Create: `app/src/lib/ai/__tests__/ocr-provider.test.ts`
- Create: `app/src/lib/ai/__tests__/pdf-text-extractor.test.ts`
- Modify: `.claude/CLAUDE.md` — aggiunge `OCR_SPACE_API_KEY` alla sezione env var.

---

## Task 1: Dipendenza `unpdf`

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Produces: il modulo `unpdf` disponibile per import in `pdf-text-extractor.ts` (Task 4).

- [ ] **Step 1: Installare la dipendenza**

Run: `cd app && npm install unpdf@^1.6.2`
Expected: `unpdf` compare in `app/package.json` sotto `dependencies`, `package-lock.json`
aggiornato.

- [ ] **Step 2: Verificare che il typecheck resti pulito**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/package.json package-lock.json
git commit -m "chore(app): add unpdf dependency for PDF text-layer extraction"
```

---

## Task 2: Errore tipizzato dell'estrazione

**Files:**
- Create: `app/src/lib/ai/pdf-extraction-error.ts`
- Test: `app/src/lib/ai/__tests__/pdf-extraction-error.test.ts`

**Interfaces:**
- Produces:
  - `type PdfExtractionErrorKind = "download" | "ocr"`
  - `class PdfExtractionError extends Error { readonly kind: PdfExtractionErrorKind }`
  - consumato da `ocr-provider.ts` (Task 3) e `pdf-text-extractor.ts` (Task 4).

- [ ] **Step 1: Scrivere il test**

Create `app/src/lib/ai/__tests__/pdf-extraction-error.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PdfExtractionError } from "../pdf-extraction-error";

describe("PdfExtractionError", () => {
  it("carries its kind and message, and chains a cause", () => {
    const cause = new Error("network down");
    const err = new PdfExtractionError("download", "impossibile scaricare il PDF", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe("download");
    expect(err.message).toBe("impossibile scaricare il PDF");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("PdfExtractionError");
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/pdf-extraction-error.test.ts`
Expected: FAIL — `Cannot find module '../pdf-extraction-error'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/pdf-extraction-error.ts`:

```typescript
// app/src/lib/ai/pdf-extraction-error.ts
// Typed failure for the PDF-extraction seam (spec §4/§Rischi). Only two terminal-failure kinds:
// "download" (couldn't fetch the attachment) and "ocr" (scanned PDF, and OCR also failed).
// A library parse failure on the text layer is NOT a terminal error — pdf-text-extractor.ts
// treats it as "no extractable text" and falls through to OCR, same as a genuinely scanned PDF.
export type PdfExtractionErrorKind = "download" | "ocr";

export class PdfExtractionError extends Error {
  readonly kind: PdfExtractionErrorKind;

  constructor(kind: PdfExtractionErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
    this.name = "PdfExtractionError";
  }
}
```

- [ ] **Step 4: Eseguire il test per verificarlo passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/pdf-extraction-error.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/ai/pdf-extraction-error.ts app/src/lib/ai/__tests__/pdf-extraction-error.test.ts
git commit -m "feat(ai): PdfExtractionError typed error for the PDF-extraction seam"
```

---

## Task 3: Seam `OcrProvider` + `OcrSpaceProvider`

**Files:**
- Create: `app/src/lib/ai/ocr-provider.ts`
- Test: `app/src/lib/ai/__tests__/ocr-provider.test.ts`

**Interfaces:**
- Consumes: `PdfExtractionError` (Task 2).
- Produces:
  - `interface OcrProvider { ocr(fileBytes: Uint8Array, mimeType: string): Promise<string> }`
  - `class OcrSpaceProvider implements OcrProvider` — constructor
    `{ apiKey: string; fetchImpl?: typeof fetch; endpoint?: string }`.
  - `function getOcrProvider(): OcrProvider` — legge `process.env.OCR_SPACE_API_KEY`; lancia un
    errore con messaggio guida-utente se assente.
  - consumato da `pdf-text-extractor.ts` (Task 4) e dal worker (Piano 3).

- [ ] **Step 1: Scrivere il primo test (richiesta costruita correttamente, risposta OK parsata)**

Create `app/src/lib/ai/__tests__/ocr-provider.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { OcrSpaceProvider, getOcrProvider } from "../ocr-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OcrSpaceProvider", () => {
  it("posts the PDF as multipart form-data with engine 2 and parses ParsedText", async () => {
    let capturedUrl = "";
    let capturedForm: FormData | undefined;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedForm = init.body as FormData;
      return jsonResponse(200, {
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Testo del bando estratto" }],
      });
    });

    const provider = new OcrSpaceProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await provider.ocr(new Uint8Array([1, 2, 3]), "application/pdf");

    expect(text).toBe("Testo del bando estratto");
    expect(capturedUrl).toBe("https://api.ocr.space/parse/image");
    expect(capturedForm).toBeInstanceOf(FormData);
    expect(capturedForm!.get("apikey")).toBe("test-key");
    expect(capturedForm!.get("filetype")).toBe("PDF");
    expect(capturedForm!.get("OCREngine")).toBe("2");
    const file = capturedForm!.get("file") as Blob;
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe("application/pdf");
  });

  it("joins ParsedText across multiple results", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Pagina 1" }, { ParsedText: "Pagina 2" }],
      }),
    );
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await provider.ocr(new Uint8Array([1]), "application/pdf");
    expect(text).toBe("Pagina 1\nPagina 2");
  });

  it("throws when OCR.space reports IsErroredOnProcessing", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { IsErroredOnProcessing: true, ErrorMessage: ["file corrotto"] }),
    );
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.ocr(new Uint8Array([1]), "application/pdf")).rejects.toMatchObject({
      kind: "ocr",
    });
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchImpl = vi.fn(async () => new Response("server error", { status: 500 }));
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.ocr(new Uint8Array([1]), "application/pdf")).rejects.toMatchObject({
      kind: "ocr",
    });
  });
});

describe("getOcrProvider", () => {
  it("builds an OcrSpaceProvider from OCR_SPACE_API_KEY", () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "env-key");
    expect(getOcrProvider()).toBeInstanceOf(OcrSpaceProvider);
    vi.unstubAllEnvs();
  });

  it("throws a guidance error when OCR_SPACE_API_KEY is missing", () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "");
    expect(() => getOcrProvider()).toThrow(/OCR_SPACE_API_KEY/);
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/ocr-provider.test.ts`
Expected: FAIL — `Cannot find module '../ocr-provider'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/ocr-provider.ts`:

```typescript
// app/src/lib/ai/ocr-provider.ts
// OCR seam (spec §4): scanned-PDF fallback when the text layer is empty/missing. Default impl
// posts the PDF bytes DIRECTLY to OCR.space (filetype=PDF) — no rasterization/canvas dependency,
// which matters in a serverless runtime (Vercel). Swappable behind OcrProvider (e.g. a future
// Google Cloud Vision provider would rasterize internally; callers never change).
import { PdfExtractionError } from "./pdf-extraction-error";

export interface OcrProvider {
  ocr(fileBytes: Uint8Array, mimeType: string): Promise<string>;
}

interface OcrSpaceParsedResult {
  ParsedText?: string;
}

interface OcrSpaceResponseBody {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: OcrSpaceParsedResult[];
}

export interface OcrSpaceConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = "https://api.ocr.space/parse/image";

export class OcrSpaceProvider implements OcrProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(config: OcrSpaceConfig) {
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  }

  async ocr(fileBytes: Uint8Array, mimeType: string): Promise<string> {
    const form = new FormData();
    form.set("apikey", this.apiKey);
    form.set("file", new Blob([fileBytes], { type: mimeType }), "document.pdf");
    form.set("filetype", "PDF");
    form.set("OCREngine", "2");
    form.set("isOverlayRequired", "false");
    form.set("scale", "true");

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", body: form });
    } catch (cause) {
      throw new PdfExtractionError("ocr", "OCR.space: errore di rete", { cause });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new PdfExtractionError("ocr", `OCR.space: HTTP ${res.status} ${detail}`.trim());
    }

    let body: OcrSpaceResponseBody;
    try {
      body = (await res.json()) as OcrSpaceResponseBody;
    } catch (cause) {
      throw new PdfExtractionError("ocr", "OCR.space: risposta non-JSON", { cause });
    }

    if (body.IsErroredOnProcessing || !body.ParsedResults?.length) {
      const detail = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join("; ") : body.ErrorMessage;
      throw new PdfExtractionError("ocr", `OCR.space: ${detail ?? "nessun testo estratto"}`);
    }

    return body.ParsedResults.map((r) => r.ParsedText ?? "").join("\n").trim();
  }
}

// Factory reading the free OCR.space API key from env. Throws a guidance message rather than
// a bare "undefined" error — onboarding requires a manual signup (spec §4 note), so the failure
// must tell the operator exactly what to do.
export function getOcrProvider(): OcrProvider {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OCR_SPACE_API_KEY non impostata. Registrati su https://ocr.space/ocrapi (piano free) " +
        "e imposta la chiave come variabile d'ambiente OCR_SPACE_API_KEY.",
    );
  }
  return new OcrSpaceProvider({ apiKey });
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/ocr-provider.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/ocr-provider.ts app/src/lib/ai/__tests__/ocr-provider.test.ts
git commit -m "feat(ai): OcrProvider seam + OcrSpaceProvider (direct PDF OCR, no rasterization)"
```

---

## Task 4: `PdfTextExtractor` (libreria + fallback OCR)

**Files:**
- Create: `app/src/lib/ai/pdf-text-extractor.ts`
- Test: `app/src/lib/ai/__tests__/pdf-text-extractor.test.ts`

**Interfaces:**
- Consumes: `OcrProvider` (Task 3), `PdfExtractionError` (Task 2), `unpdf`'s `getDocumentProxy`/
  `extractText` (Task 1).
- Produces:
  - `interface PdfExtractionResult { text: string; ocrUsed: boolean }`
  - `interface PdfTextExtractor { extract(url: string): Promise<PdfExtractionResult> }`
  - `const MIN_TEXT_LAYER_LENGTH = 50`
  - `function createPdfTextExtractor(deps: { ocr: OcrProvider; fetchBytes?: (url: string) => Promise<Uint8Array> }): PdfTextExtractor`
  - consumato dal worker (Piano 3).

- [ ] **Step 1: Scrivere il primo test (PDF con layer testo, nessun OCR)**

Create `app/src/lib/ai/__tests__/pdf-text-extractor.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createPdfTextExtractor } from "../pdf-text-extractor";
import type { OcrProvider } from "../ocr-provider";

// Minimal real single-page PDFs (built with unpdf itself and verified to parse), embedded as
// base64 so the text-layer path runs against real PDF bytes — no mocking of unpdf.
// "with text": one Tj showing "Hello Bando". "without text": same structure, empty Tj — a stand-in
// for a scanned PDF (valid PDF, zero extractable text layer).
const PDF_WITH_TEXT_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA0MDAgMjAwXSAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggOTAgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiAyMCAxMDAgVGQgKEJhbmRvIHRlcnpvIHNldHRvcmUgZHVlbWlsYXZlbnRpc2VpIGNvbnRyaWJ1dG8gYXNzb2NpYXppb25pKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDUxCiUlRU9G";
const PDF_WITHOUT_TEXT_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMzEgPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiAyMCAxMDAgVGQgKCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjM5MgolJUVPRg==";

function pdfBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function fakeOcr(text: string): OcrProvider {
  return { ocr: vi.fn(async () => text) };
}

describe("createPdfTextExtractor", () => {
  it("returns the text layer without calling OCR when the PDF has extractable text", async () => {
    const ocr = fakeOcr("SHOULD NOT BE CALLED");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITH_TEXT_B64),
    });

    const result = await extractor.extract("https://example.org/bando.pdf");

    expect(result.text).toBe("Bando terzo settore duemilaventisei contributo associazioni");
    expect(result.ocrUsed).toBe(false);
    expect(ocr.ocr).not.toHaveBeenCalled();
  });

  it("falls back to OCR when the text layer is empty (scanned PDF)", async () => {
    const ocr = fakeOcr("Testo OCR estratto dalla scansione");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITHOUT_TEXT_B64),
    });

    const result = await extractor.extract("https://example.org/scansione.pdf");

    expect(result.text).toBe("Testo OCR estratto dalla scansione");
    expect(result.ocrUsed).toBe(true);
    expect(ocr.ocr).toHaveBeenCalledTimes(1);
    const [bytes, mimeType] = (ocr.ocr as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(mimeType).toBe("application/pdf");
  });

  it("wraps a download failure in a typed PdfExtractionError", async () => {
    const ocr = fakeOcr("unused");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => {
        throw new Error("connection refused");
      },
    });

    await expect(extractor.extract("https://example.org/broken.pdf")).rejects.toMatchObject({
      kind: "download",
    });
  });

  it("propagates a typed PdfExtractionError when OCR fails on a scanned PDF", async () => {
    const ocr: OcrProvider = {
      ocr: vi.fn(async () => {
        throw new Error("ocr provider down");
      }),
    };
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITHOUT_TEXT_B64),
    });

    await expect(extractor.extract("https://example.org/scansione.pdf")).rejects.toThrow(
      "ocr provider down",
    );
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/pdf-text-extractor.test.ts`
Expected: FAIL — `Cannot find module '../pdf-text-extractor'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/pdf-text-extractor.ts`:

```typescript
// app/src/lib/ai/pdf-text-extractor.ts
// Given an attachment URL: download -> try the text layer (unpdf, pure JS, no native deps) ->
// if it's empty/near-empty (scanned PDF), fall back to OcrProvider on the raw bytes (spec §4).
// A library parse failure on the text layer is treated as "no text" (falls through to OCR),
// not a terminal error — only a download failure or an OCR failure is terminal.
import { getDocumentProxy, extractText } from "unpdf";
import { PdfExtractionError } from "./pdf-extraction-error";
import type { OcrProvider } from "./ocr-provider";

export interface PdfExtractionResult {
  text: string;
  ocrUsed: boolean;
}

export interface PdfTextExtractor {
  extract(url: string): Promise<PdfExtractionResult>;
}

// Below this length, the text layer is considered absent (scanned PDF) rather than "a very
// short real document" — grant attachments are never legitimately this short.
export const MIN_TEXT_LAYER_LENGTH = 50;

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function extractTextLayer(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  } catch {
    // Corrupted/unparseable PDF: treat as "no text layer", let OCR have a try.
    return "";
  }
}

export function createPdfTextExtractor(deps: {
  ocr: OcrProvider;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
}): PdfTextExtractor {
  const fetchBytes = deps.fetchBytes ?? defaultFetchBytes;

  return {
    async extract(url: string): Promise<PdfExtractionResult> {
      let bytes: Uint8Array;
      try {
        bytes = await fetchBytes(url);
      } catch (cause) {
        throw new PdfExtractionError("download", `Impossibile scaricare il PDF: ${url}`, { cause });
      }

      const layerText = await extractTextLayer(bytes);
      if (layerText.length >= MIN_TEXT_LAYER_LENGTH) {
        return { text: layerText, ocrUsed: false };
      }

      const ocrText = await deps.ocr.ocr(bytes, "application/pdf");
      return { text: ocrText.trim(), ocrUsed: true };
    },
  };
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/pdf-text-extractor.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/pdf-text-extractor.ts app/src/lib/ai/__tests__/pdf-text-extractor.test.ts
git commit -m "feat(ai): PdfTextExtractor — text-layer extraction with OCR fallback"
```

---

## Task 5: Documentare la env var + verifica finale

**Files:**
- Modify: `.claude/CLAUDE.md`

**Interfaces:** nessuna (solo documentazione).

- [ ] **Step 1: Aggiungere `OCR_SPACE_API_KEY` alla sezione Environment variables**

In `.claude/CLAUDE.md`, nella sezione `## Environment variables`, sotto la riga `App:`, aggiungere
una riga:

```markdown
App (analisi forte, Piano 2+): `OCR_SPACE_API_KEY` (free tier, registrazione su https://ocr.space/ocrapi — necessaria solo per bandi con PDF scansionati)
```

- [ ] **Step 2: Eseguire l'intera suite app per verificare che nulla si sia rotto**

Run: `cd app && npm test`
Expected: tutti i test passano (quelli esistenti + i nuovi di questo piano).

- [ ] **Step 3: Typecheck finale**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(ai): document OCR_SPACE_API_KEY env var (strong AI analysis V1, plan 2/6)"
```

---

## Self-Review (Piano 2)

- **Copertura spec:** §4 "Motore di estrazione: libreria + OCR fallback, dietro seam
  `OcrProvider`" → Task 3 (seam + `OcrSpaceProvider`) e Task 4 (`PdfTextExtractor`, libreria
  prima, OCR come fallback). "NON si passa dall'LLM per l'OCR" → rispettato, nessun `LLMProvider`
  coinvolto. Nota onboarding OCR.space (registrazione, env var) → Task 5 + messaggio d'errore
  guida-utente in `getOcrProvider()`. Rasterizzazione: **deviazione consapevole e documentata**
  nell'Architecture — si manda il PDF nativo a OCR.space invece di rasterizzare pagine in
  immagini, evitando una dipendenza canvas nel runtime serverless; il seam resta identico a
  quanto richiesto, un provider futuro può rasterizzare internamente se necessario. Coperto.
- **Fuori scope (corretto):** worker asincrono/pg_cron, migration, route, UI → Piano 3+.
- **Placeholder:** nessun TBD; tutto il codice (TS, test, PDF fixture) è completo e verificato
  eseguendo realmente `unpdf` contro le fixture prima di scrivere questo piano.
- **Consistenza tipi:** `OcrProvider.ocr(fileBytes: Uint8Array, mimeType: string): Promise<string>`
  usato identico in `ocr-provider.ts`, nel suo test, e come dipendenza di
  `createPdfTextExtractor` in `pdf-text-extractor.ts`. `PdfExtractionError.kind` ∈
  `{"download","ocr"}` usato identico in entrambi i moduli che lo lanciano.
