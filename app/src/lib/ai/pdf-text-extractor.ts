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
