import { describe, it, expect } from "vitest";
import { GroqProvider } from "../../src/providers/groq";
import { OpenAIProvider } from "../../src/providers/openai";
import { ProviderError } from "../../src/providers/types";
import { bodyOf, mockFetch, mockResponse, noWaitRetry } from "../helpers/http";

const schema = { type: "array" } as const;
const input = { html: "<h1>Bando</h1>", schema, instructions: "Estrai i bandi." };

function chatEnvelope(content: string) {
  return { choices: [{ message: { content } }] };
}

describe.each([
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", make: (c: any) => new GroqProvider(c) },
  { name: "openai", url: "https://api.openai.com/v1/chat/completions", make: (c: any) => new OpenAIProvider(c) },
])("$name (OpenAI-compatible)", ({ name, url, make }) => {
  it("posts to the right endpoint with a bearer key and json_object mode", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, chatEnvelope('{"grants":[]}'))]);
    await make({ apiKey: "secret", model: `${name}-x`, fetchImpl }).extract(input);

    expect(requests[0]!.url).toBe(url);
    expect(requests[0]!.init.headers["authorization"]).toBe("Bearer secret");
    const body = bodyOf(requests[0]!);
    expect(body.model).toBe(`${name}-x`);
    expect(body.response_format).toEqual({ type: "json_object" });
    const messages = JSON.stringify(body.messages);
    expect(messages).toContain("Estrai i bandi.");
    expect(messages).toContain("<h1>Bando</h1>");
  });

  it("unwraps the { grants: [...] } object into the array", async () => {
    const grants = [{ title: "A", url: "https://x/1" }];
    const { fetchImpl } = mockFetch([mockResponse(200, chatEnvelope(JSON.stringify({ grants })))]);
    const out = await make({ apiKey: "k", fetchImpl }).extract(input);
    expect(out).toEqual(grants);
  });

  it("retries a 500 then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(500, {}), mockResponse(200, chatEnvelope('{"grants":[]}'))]);
    const out = await make({ apiKey: "k", fetchImpl, ...noWaitRetry }).extract(input);
    expect(out).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError on truncated model JSON", async () => {
    const { fetchImpl } = mockFetch([mockResponse(200, chatEnvelope('{"grants":[{"title"'))]);
    await expect(make({ apiKey: "k", fetchImpl }).extract(input)).rejects.toBeInstanceOf(ProviderError);
  });
});
