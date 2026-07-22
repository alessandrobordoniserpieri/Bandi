import { describe, it, expect, vi } from "vitest";
import { GeminiEmbeddingProvider, getEmbeddingProvider, EMBEDDING_DIMS } from "../embedding-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const vec = (n: number) => Array.from({ length: EMBEDDING_DIMS }, () => n);

describe("GeminiEmbeddingProvider", () => {
  it("embeds each text via embedContent and returns one vector per input, preserving order", async () => {
    const urls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      bodies.push(JSON.parse(init.body as string));
      return jsonResponse(200, { embedding: { values: vec(call++ === 0 ? 0.1 : 0.2) } });
    });

    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await provider.embed(["primo bando", "secondo bando"]);

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(vec(0.1));
    expect(out[1]).toEqual(vec(0.2));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(urls[0]).toContain("gemini-embedding-001:embedContent");
    expect(urls[0]).toContain("key=k");
    expect(bodies[0]!.outputDimensionality).toBe(EMBEDDING_DIMS);
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

  it("throws when the returned vector has the wrong dimensionality", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { embedding: { values: [1, 2, 3] } }));
    const provider = new GeminiEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.embed(["a"])).rejects.toThrow();
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
