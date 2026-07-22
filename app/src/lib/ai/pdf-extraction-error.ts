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
