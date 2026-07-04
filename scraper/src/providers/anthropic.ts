// scraper/src/providers/anthropic.ts
import type { JsonSchema, LLMProvider } from "./types";
import { ProviderError } from "./types";
import { defaultFetch, postJson, record, type FetchLike, type ProviderConfig } from "./http";
import { withRetry, type RetryOptions } from "./retry";

const DEFAULT_MODEL = "claude-3-5-haiku-latest";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const TOOL_NAME = "extract_grants";

// Anthropic Messages API with tool-use for structured output. A tool input_schema must have
// an object root, so the array schema is wrapped as { grants: <schema> }. The response block
// input is already a parsed value — no JSON.parse — so we return input.grants directly.
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
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
    const envelope = await withRetry(
      () =>
        postJson(this.fetchImpl, {
          url: ENDPOINT,
          headers: { "x-api-key": this.apiKey, "anthropic-version": API_VERSION },
          providerName: this.name,
          body: {
            model: this.model,
            max_tokens: 4096,
            tools: [
              {
                name: TOOL_NAME,
                description: "Restituisce i bandi estratti dalla pagina.",
                input_schema: {
                  type: "object",
                  properties: { grants: input.schema },
                  required: ["grants"],
                },
              },
            ],
            tool_choice: { type: "tool", name: TOOL_NAME },
            messages: [{ role: "user", content: `${input.instructions}\n\n${input.html}` }],
          },
        }),
      this.retry,
    );
    return anthropicGrants(envelope, this.name);
  }
}

// content[*] where type === "tool_use" && name === TOOL_NAME → input.grants (already parsed).
function anthropicGrants(envelope: unknown, providerName: string): unknown {
  const content = record(envelope)?.content;
  const block = Array.isArray(content)
    ? content.find((b) => record(b)?.type === "tool_use" && record(b)?.name === TOOL_NAME)
    : undefined;
  const input = record(record(block)?.input);
  if (!input || !("grants" in input)) {
    throw new ProviderError(`${providerName}: nessun blocco tool_use "${TOOL_NAME}" nella risposta`, {
      retryable: false,
    });
  }
  return input.grants;
}
