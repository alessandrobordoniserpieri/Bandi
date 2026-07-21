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
