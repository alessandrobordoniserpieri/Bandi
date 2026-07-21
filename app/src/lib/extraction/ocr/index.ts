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
