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
