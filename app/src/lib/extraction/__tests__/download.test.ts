import { describe, it, expect } from "vitest";
import { downloadPdf } from "../download";
import { ExtractionError, type FetchImpl } from "../types";

// Minimal fake of the fetch Response subset downloadPdf uses. `headers` is an optional map for
// tests that need to assert on header-driven behavior (e.g. Content-Length pre-check);
// `arrayBufferCalls`, if passed, is incremented every time `arrayBuffer()` is invoked so a test can
// assert the body was never buffered.
function fakeFetch(res: {
  ok?: boolean;
  status?: number;
  body?: Uint8Array;
  headers?: Record<string, string>;
  arrayBufferCalls?: { count: number };
}): FetchImpl {
  const bytes = res.body ?? new TextEncoder().encode("%PDF-1.4\n...");
  const headers = res.headers ?? {};
  return (async () => ({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => {
      if (res.arrayBufferCalls) res.arrayBufferCalls.count++;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
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

  it("throws too_large from a declared Content-Length over maxBytes without buffering the body", async () => {
    const arrayBufferCalls = { count: 0 };
    await expect(
      downloadPdf("http://x/a.pdf", {
        fetchImpl: fakeFetch({ headers: { "content-length": "1000000" }, arrayBufferCalls }),
        maxBytes: 8,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(arrayBufferCalls.count).toBe(0);
  });

  it("ignores a garbled Content-Length header and falls through to the real body-size check", async () => {
    const out = await downloadPdf("http://x/a.pdf", {
      fetchImpl: fakeFetch({ headers: { "content-length": "abc" } }),
      maxBytes: 1024,
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(out).startsWith("%PDF-")).toBe(true);
  });
});
