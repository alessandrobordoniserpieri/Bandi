// scraper/src/providers/types.ts
export type JsonSchema = Record<string, unknown>;

export interface LLMProvider {
  readonly name: string;
  // Returns the model's raw structured output (unknown — the caller validates).
  extract(input: { html: string; schema: JsonSchema; instructions: string }): Promise<unknown>;
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ProviderError";
    this.retryable = opts?.retryable ?? false;
  }
}
