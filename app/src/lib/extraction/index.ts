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
