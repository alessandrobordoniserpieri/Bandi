// scraper/src/providers/gemini.ts
import type { JsonSchema, LLMProvider } from "./types";
import { ProviderError } from "./types";
import { defaultFetch, parseJsonText, postJson, record, type FetchLike, type ProviderConfig } from "./http";
import { withRetry, type RetryOptions } from "./retry";

const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini REST generateContent with JSON output mode. The response schema is the array schema
// directly (Gemini supports an array root), so the model text is a JSON array string.
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;
  private readonly retry?: RetryOptions;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.retry = config.retry;
  }

  async extract(input: { html: string; schema: JsonSchema; instructions: string }): Promise<unknown> {
    const url = `${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const envelope = await withRetry(
      () =>
        postJson(this.fetchImpl, {
          url,
          headers: {},
          providerName: this.name,
          body: {
            contents: [{ role: "user", parts: [{ text: `${input.instructions}\n\n${input.html}` }] }],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: input.schema,
            },
          },
        }),
      this.retry,
    );
    return parseJsonText(geminiText(envelope, this.name), this.name);
  }
}

// candidates[0].content.parts[*].text — joined (the SDK can split long output across parts).
function geminiText(envelope: unknown, providerName: string): string {
  const candidate = (record(envelope)?.candidates as unknown[] | undefined)?.[0];
  const parts = record(record(candidate)?.content)?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => (typeof record(p)?.text === "string" ? (record(p)!.text as string) : "")).join("")
    : "";
  if (!text) throw new ProviderError(`${providerName}: risposta senza testo`, { retryable: false });
  return text;
}
