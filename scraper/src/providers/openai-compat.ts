// scraper/src/providers/openai-compat.ts
// Shared logic for OpenAI-compatible chat-completions endpoints (OpenAI and Groq).
import type { JsonSchema } from "./types";
import { ProviderError } from "./types";
import { parseJsonText, postJson, record, unwrapGrants, type FetchLike } from "./http";
import { withRetry, type RetryOptions } from "./retry";

export interface ChatCompletionArgs {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  fetchImpl: FetchLike;
  retry?: RetryOptions;
  input: { html: string; schema: JsonSchema; instructions: string };
}

// JSON mode returns an object, so we ask for a { grants: [...] } wrapper and unwrap it.
export async function chatCompletionExtract(args: ChatCompletionArgs): Promise<unknown> {
  const system = `${args.input.instructions} Rispondi SOLO con un oggetto JSON della forma {"grants": [...]}.`;
  const envelope = await withRetry(
    () =>
      postJson(args.fetchImpl, {
        url: args.url,
        headers: { authorization: `Bearer ${args.apiKey}` },
        providerName: args.name,
        body: {
          model: args.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: args.input.html },
          ],
        },
      }),
    args.retry,
  );
  return unwrapGrants(parseJsonText(chatText(envelope, args.name), args.name));
}

// choices[0].message.content — the JSON string produced under json_object mode.
function chatText(envelope: unknown, providerName: string): string {
  const choice = (record(envelope)?.choices as unknown[] | undefined)?.[0];
  const content = record(record(choice)?.message)?.content;
  if (typeof content !== "string" || content === "") {
    throw new ProviderError(`${providerName}: risposta senza contenuto`, { retryable: false });
  }
  return content;
}
