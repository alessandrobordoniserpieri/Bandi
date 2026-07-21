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
