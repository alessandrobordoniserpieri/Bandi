import { describe, it, expect } from "vitest";
import { downloadPdf } from "../download";
import { ExtractionError, type FetchImpl } from "../types";

// Minimal fake of the fetch Response subset downloadPdf uses.
function fakeFetch(res: { ok?: boolean; status?: number; body?: Uint8Array }): FetchImpl {
  const bytes = res.body ?? new TextEncoder().encode("%PDF-1.4\n...");
  return (async () => ({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => "detail",
  })) as unknown as FetchImpl;
}

describe("downloadPdf", () => {
  it("returns the bytes for a 200 response that looks like a PDF", async () => {
    const out = await downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({}) });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(out).startsWith("%PDF-")).toBe(true);
  });

  it("throws a RETRYABLE download_failed on 5xx", async () => {
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ ok: false, status: 503 }) }))
      .rejects.toMatchObject({ code: "download_failed", retryable: true });
  });

  it("throws a NON-retryable download_failed on 404", async () => {
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ ok: false, status: 404 }) }))
      .rejects.toMatchObject({ code: "download_failed", retryable: false });
  });

  it("throws not_pdf when the bytes are not a PDF", async () => {
    const html = new TextEncoder().encode("<!doctype html><html>404</html>");
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ body: html }) }))
      .rejects.toMatchObject({ code: "not_pdf" });
  });

  it("throws too_large when the file exceeds maxBytes", async () => {
    const big = new Uint8Array(10 + 5).fill(0x20);
    big.set(new TextEncoder().encode("%PDF-1.4"), 0);
    await expect(downloadPdf("http://x/a.pdf", { fetchImpl: fakeFetch({ body: big }), maxBytes: 8 }))
      .rejects.toMatchObject({ code: "too_large" });
  });
});
