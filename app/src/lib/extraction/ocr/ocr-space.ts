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
