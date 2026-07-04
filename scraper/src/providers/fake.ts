// scraper/src/providers/fake.ts
import type { JsonSchema, LLMProvider } from "./types";
import { ProviderError } from "./types";

// Deterministic provider for tests: maps an input html string to a canned
// structured response. Unmapped html → throws (retryable) or returns [] per config.
export class FakeLLMProvider implements LLMProvider {
  readonly name = "fake";
  constructor(
    private readonly responses: Map<string, unknown>,
    private readonly onMissing: "empty" | "throw" = "empty",
  ) {}
  async extract(input: { html: string; schema: JsonSchema; instructions: string }): Promise<unknown> {
    if (this.responses.has(input.html)) return this.responses.get(input.html);
    if (this.onMissing === "throw") throw new ProviderError("no fixture for html", { retryable: true });
    return [];
  }
}
