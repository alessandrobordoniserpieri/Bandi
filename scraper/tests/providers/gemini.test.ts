import { describe, it, expect } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini";
import { ProviderError } from "../../src/providers/types";
import { bodyOf, mockFetch, mockResponse, noWaitRetry } from "../helpers/http";

const schema = { type: "array" } as const;
const input = { html: "<h1>Bando</h1>", schema, instructions: "Estrai i bandi." };

function geminiEnvelope(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

describe("GeminiProvider", () => {
  it("builds the correct request (url, model, key, schema, mime, prompt)", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, geminiEnvelope("[]"))]);
    await new GeminiProvider({ apiKey: "secret", model: "gemini-x", fetchImpl }).extract(input);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=secret",
    );
    const body = bodyOf(requests[0]!);
    const gen = body.generationConfig as Record<string, unknown>;
    expect(gen.response_mime_type).toBe("application/json");
    expect(gen.response_schema).toEqual(schema);
    const promptText = JSON.stringify(body.contents);
    expect(promptText).toContain("Estrai i bandi.");
    expect(promptText).toContain("<h1>Bando</h1>");
  });

  it("parses the candidate text into the grants array", async () => {
    const grants = [{ title: "A", url: "https://x/1" }];
    const { fetchImpl } = mockFetch([mockResponse(200, geminiEnvelope(JSON.stringify(grants)))]);
    const out = await new GeminiProvider({ apiKey: "k", fetchImpl }).extract(input);
    expect(out).toEqual(grants);
  });

  it("retries a 429 then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([
      mockResponse(429, {}),
      mockResponse(200, geminiEnvelope("[]")),
    ]);
    const out = await new GeminiProvider({ apiKey: "k", fetchImpl, ...noWaitRetry }).extract(input);
    expect(out).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError on truncated model JSON", async () => {
    const { fetchImpl } = mockFetch([mockResponse(200, geminiEnvelope('[{"title":"A"'))]);
    await expect(new GeminiProvider({ apiKey: "k", fetchImpl }).extract(input)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it("throws a non-retryable ProviderError on 400 (no retry)", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(400, "bad request"), mockResponse(200, geminiEnvelope("[]"))]);
    await expect(
      new GeminiProvider({ apiKey: "k", fetchImpl, ...noWaitRetry }).extract(input),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(1);
  });
});
