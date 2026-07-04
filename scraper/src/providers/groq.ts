// scraper/src/providers/groq.ts
import type { JsonSchema, LLMProvider } from "./types";
import { defaultFetch, type FetchLike, type ProviderConfig } from "./http";
import { chatCompletionExtract } from "./openai-compat";
import type { RetryOptions } from "./retry";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
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

  extract(input: { html: string; schema: JsonSchema; instructions: string }): Promise<unknown> {
    return chatCompletionExtract({
      name: this.name,
      url: ENDPOINT,
      apiKey: this.apiKey,
      model: this.model,
      fetchImpl: this.fetchImpl,
      retry: this.retry,
      input,
    });
  }
}
