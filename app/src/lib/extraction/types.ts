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
