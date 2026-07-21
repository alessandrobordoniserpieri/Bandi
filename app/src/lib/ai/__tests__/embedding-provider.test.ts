import { describe, it, expect, vi } from "vitest";
import { GeminiEmbeddingProvider, getEmbeddingProvider, EMBEDDING_DIMS } from "../embedding-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const vec = (n: number) => Array.from({ length: EMBEDDING_DIMS }, () => n);

describe("GeminiEmbeddingProvider", () => {
  it("batch-embeds texts and returns one vector per input, preserving order", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse(200, { embeddings: [{ values: vec(0.1) }, { values: vec(0.2) }] });
    });

    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await provider.embed(["primo bando", "secondo bando"]);

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(vec(0.1));
    expect(out[1]).toEqual(vec(0.2));
    expect(capturedUrl).toContain("text-embedding-004:batchEmbedContents");
    expect(capturedUrl).toContain("key=k");
    const requests = capturedBody!.requests as unknown[];
    expect(requests).toHaveLength(2);
  });

  it("returns [] without calling the API for an empty input", async () => {
    const fetchImpl = vi.fn();
    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await provider.embed([]);
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(["x"])).rejects.toThrow(/embedding/i);
  });

  it("throws when the count of returned vectors does not match the inputs", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { embeddings: [{ values: vec(0.1) }] }));
    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(["a", "b"])).rejects.toThrow();
  });
});

describe("getEmbeddingProvider", () => {
  it("builds a GeminiEmbeddingProvider from GEMINI_API_KEY", () => {
    vi.stubEnv("GEMINI_API_KEY", "env-key");
    expect(getEmbeddingProvider()).toBeInstanceOf(GeminiEmbeddingProvider);
    vi.unstubAllEnvs();
  });

  it("throws a guidance error when GEMINI_API_KEY is missing", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => getEmbeddingProvider()).toThrow(/GEMINI_API_KEY/);
    vi.unstubAllEnvs();
  });
});
