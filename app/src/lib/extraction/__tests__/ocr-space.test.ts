import { describe, it, expect, vi } from "vitest";
import { OcrSpaceProvider } from "../ocr/ocr-space";
import { getOcrProvider } from "../ocr/index";
import type { FetchImpl } from "../types";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeFetch(payload: {
  ok?: boolean; status?: number; json?: unknown;
}): { impl: FetchImpl; calls: number } {
  const box = { calls: 0 };
  const impl = (async () => {
    box.calls += 1;
    return {
      ok: payload.ok ?? true,
      status: payload.status ?? 200,
      json: async () => payload.json ?? { ParsedResults: [{ ParsedText: "" }], OCRExitCode: 1, IsErroredOnProcessing: false },
      text: async () => "err",
    };
  }) as unknown as FetchImpl;
  return { impl, get calls() { return box.calls; } } as { impl: FetchImpl; calls: number };
}

describe("OcrSpaceProvider", () => {
  it("joins ParsedText from a successful response", async () => {
    const f = fakeFetch({ json: { ParsedResults: [{ ParsedText: "Riga uno" }, { ParsedText: "Riga due" }], OCRExitCode: 1, IsErroredOnProcessing: false } });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    expect(await p.ocr(PNG)).toBe("Riga uno\nRiga due");
  });

  it("throws a NON-retryable ocr_failed when IsErroredOnProcessing is true", async () => {
    const f = fakeFetch({ json: { IsErroredOnProcessing: true, ErrorMessage: ["timeout"] } });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    await expect(p.ocr(PNG)).rejects.toMatchObject({ code: "ocr_failed", retryable: false });
  });

  it("throws a RETRYABLE ocr_failed on HTTP 429/5xx", async () => {
    const f = fakeFetch({ ok: false, status: 429 });
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    await expect(p.ocr(PNG)).rejects.toMatchObject({ code: "ocr_failed", retryable: true });
  });

  it("rejects an image over 1 MB WITHOUT calling the API (free-tier limit)", async () => {
    const f = fakeFetch({});
    const p = new OcrSpaceProvider({ apiKey: "k", fetchImpl: f.impl });
    const big = new Uint8Array(1024 * 1024 + 1);
    await expect(p.ocr(big)).rejects.toMatchObject({ code: "too_large" });
    expect(f.calls).toBe(0);
  });
});

describe("getOcrProvider", () => {
  it("returns an OcrSpaceProvider when OCR_SPACE_API_KEY is set", () => {
    const p = getOcrProvider({ OCR_SPACE_API_KEY: "k" });
    expect(p.name).toBe("ocrspace");
  });
  it("throws a helpful error when the key is missing", () => {
    expect(() => getOcrProvider({})).toThrow(/OCR_SPACE_API_KEY/);
  });
  it("throws on an unknown OCR_PROVIDER", () => {
    expect(() => getOcrProvider({ OCR_PROVIDER: "nope", OCR_SPACE_API_KEY: "k" })).toThrow(/nope/);
  });
});
