import { describe, it, expect, vi } from "vitest";
import { createPdfTextExtractor } from "../pdf-text-extractor";
import type { OcrProvider } from "../ocr-provider";

// Minimal real single-page PDFs (built with unpdf itself and verified to parse), embedded as
// base64 so the text-layer path runs against real PDF bytes — no mocking of unpdf.
// "with text": one Tj showing "Hello Bando". "without text": same structure, empty Tj — a stand-in
// for a scanned PDF (valid PDF, zero extractable text layer).
const PDF_WITH_TEXT_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA0MDAgMjAwXSAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggOTAgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiAyMCAxMDAgVGQgKEJhbmRvIHRlcnpvIHNldHRvcmUgZHVlbWlsYXZlbnRpc2VpIGNvbnRyaWJ1dG8gYXNzb2NpYXppb25pKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDUxCiUlRU9G";
const PDF_WITHOUT_TEXT_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMzEgPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiAyMCAxMDAgVGQgKCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjM5MgolJUVPRg==";

function pdfBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function fakeOcr(text: string): OcrProvider {
  return { ocr: vi.fn(async () => text) };
}

describe("createPdfTextExtractor", () => {
  it("returns the text layer without calling OCR when the PDF has extractable text", async () => {
    const ocr = fakeOcr("SHOULD NOT BE CALLED");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITH_TEXT_B64),
    });

    const result = await extractor.extract("https://example.org/bando.pdf");

    expect(result.text).toBe("Bando terzo settore duemilaventisei contributo associazioni");
    expect(result.ocrUsed).toBe(false);
    expect(ocr.ocr).not.toHaveBeenCalled();
  });

  it("falls back to OCR when the text layer is empty (scanned PDF)", async () => {
    const ocr = fakeOcr("Testo OCR estratto dalla scansione");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITHOUT_TEXT_B64),
    });

    const result = await extractor.extract("https://example.org/scansione.pdf");

    expect(result.text).toBe("Testo OCR estratto dalla scansione");
    expect(result.ocrUsed).toBe(true);
    expect(ocr.ocr).toHaveBeenCalledTimes(1);
    const [bytes, mimeType] = (ocr.ocr as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(mimeType).toBe("application/pdf");
  });

  it("wraps a download failure in a typed PdfExtractionError", async () => {
    const ocr = fakeOcr("unused");
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => {
        throw new Error("connection refused");
      },
    });

    await expect(extractor.extract("https://example.org/broken.pdf")).rejects.toMatchObject({
      kind: "download",
    });
  });

  it("propagates a typed PdfExtractionError when OCR fails on a scanned PDF", async () => {
    const ocr: OcrProvider = {
      ocr: vi.fn(async () => {
        throw new Error("ocr provider down");
      }),
    };
    const extractor = createPdfTextExtractor({
      ocr,
      fetchBytes: async () => pdfBytes(PDF_WITHOUT_TEXT_B64),
    });

    await expect(extractor.extract("https://example.org/scansione.pdf")).rejects.toThrow(
      "ocr provider down",
    );
  });
});
