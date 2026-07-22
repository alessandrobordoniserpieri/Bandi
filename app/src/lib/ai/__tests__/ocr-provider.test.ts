import { describe, it, expect, vi } from "vitest";
import { OcrSpaceProvider, getOcrProvider } from "../ocr-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OcrSpaceProvider", () => {
  it("posts the PDF as multipart form-data with engine 2 and parses ParsedText", async () => {
    let capturedUrl = "";
    let capturedForm: FormData | undefined;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedForm = init.body as FormData;
      return jsonResponse(200, {
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Testo del bando estratto" }],
      });
    });

    const provider = new OcrSpaceProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await provider.ocr(new Uint8Array([1, 2, 3]), "application/pdf");

    expect(text).toBe("Testo del bando estratto");
    expect(capturedUrl).toBe("https://api.ocr.space/parse/image");
    expect(capturedForm).toBeInstanceOf(FormData);
    expect(capturedForm!.get("apikey")).toBe("test-key");
    expect(capturedForm!.get("filetype")).toBe("PDF");
    expect(capturedForm!.get("OCREngine")).toBe("2");
    const file = capturedForm!.get("file") as Blob;
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe("application/pdf");
  });

  it("joins ParsedText across multiple results", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Pagina 1" }, { ParsedText: "Pagina 2" }],
      }),
    );
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await provider.ocr(new Uint8Array([1]), "application/pdf");
    expect(text).toBe("Pagina 1\nPagina 2");
  });

  it("throws when OCR.space reports IsErroredOnProcessing", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { IsErroredOnProcessing: true, ErrorMessage: ["file corrotto"] }),
    );
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.ocr(new Uint8Array([1]), "application/pdf")).rejects.toMatchObject({
      kind: "ocr",
    });
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchImpl = vi.fn(async () => new Response("server error", { status: 500 }));
    const provider = new OcrSpaceProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.ocr(new Uint8Array([1]), "application/pdf")).rejects.toMatchObject({
      kind: "ocr",
    });
  });
});

describe("getOcrProvider", () => {
  it("builds an OcrSpaceProvider from OCR_SPACE_API_KEY", () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "env-key");
    expect(getOcrProvider()).toBeInstanceOf(OcrSpaceProvider);
    vi.unstubAllEnvs();
  });

  it("throws a guidance error when OCR_SPACE_API_KEY is missing", () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "");
    expect(() => getOcrProvider()).toThrow(/OCR_SPACE_API_KEY/);
    vi.unstubAllEnvs();
  });
});
