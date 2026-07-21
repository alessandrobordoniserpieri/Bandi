import { describe, it, expect } from "vitest";
import { PdfTextExtractor, type PdfTextExtractorDeps } from "../pdf-text-extractor";
import { FakeOcrProvider } from "../ocr/fake";
import { ExtractionError, type OcrProvider } from "../types";

const BYTES = new TextEncoder().encode("%PDF-1.4 fake");

function deps(over: Partial<PdfTextExtractorDeps> = {}): PdfTextExtractorDeps {
  return {
    download: async () => BYTES,
    extractTextLayer: async () => "",
    rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
    ocr: new FakeOcrProvider("pagina"),
    ...over,
  };
}

describe("PdfTextExtractor", () => {
  it("returns the text layer (ocrUsed=false) and never rasterizes when text is present", async () => {
    let rasterized = false;
    const ex = new PdfTextExtractor(deps({
      extractTextLayer: async () => "Un testo di bando sufficientemente lungo per superare la soglia.",
      rasterize: async () => { rasterized = true; return []; },
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "Un testo di bando sufficientemente lungo per superare la soglia.", ocrUsed: false });
    expect(rasterized).toBe(false);
  });

  it("falls back to OCR (ocrUsed=true) when the text layer is empty", async () => {
    const ex = new PdfTextExtractor(deps({
      rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
      ocr: new FakeOcrProvider(["pagina uno", "pagina due"]),
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "pagina uno\n\npagina due", ocrUsed: true });
  });

  it("tolerates a non-retryable per-page OCR failure (partial) and returns the rest", async () => {
    const ex = new PdfTextExtractor(deps({
      rasterize: async () => [new Uint8Array([1]), new Uint8Array([2])],
      ocr: new FakeOcrProvider([new ExtractionError("too_large", "big"), "solo questa"]),
    }));
    const res = await ex.extract("http://x/a.pdf");
    expect(res).toEqual({ text: "solo questa", ocrUsed: true });
  });

  it("throws no_text when neither the text layer nor OCR yields text", async () => {
    const ex = new PdfTextExtractor(deps({ ocr: new FakeOcrProvider("") }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "no_text" });
  });

  it("re-throws a RETRYABLE OCR outage so the worker can retry the whole document", async () => {
    const outage: OcrProvider = { name: "x", ocr: async () => { throw new ExtractionError("ocr_failed", "503", { retryable: true }); } };
    const ex = new PdfTextExtractor(deps({ ocr: outage }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "ocr_failed", retryable: true });
  });

  it("propagates a download failure", async () => {
    const ex = new PdfTextExtractor(deps({
      download: async () => { throw new ExtractionError("download_failed", "404"); },
    }));
    await expect(ex.extract("http://x/a.pdf")).rejects.toMatchObject({ code: "download_failed" });
  });
});
