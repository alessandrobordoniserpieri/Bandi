// scraper/src/providers/retry.ts
import { ProviderError } from "./types";

export interface RetryOptions {
  retries?: number;        // max total attempts (default 3)
  baseDelayMs?: number;    // first backoff delay (default 500ms), then doubles
  sleep?: (ms: number) => Promise<void>;  // injectable for tests
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `fn`, retrying only on a retryable ProviderError with exponential backoff.
// Non-retryable errors (and any non-ProviderError) propagate immediately.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? realSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      const retryable = err instanceof ProviderError && err.retryable;
      if (!retryable || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
