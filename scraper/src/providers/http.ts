// scraper/src/providers/http.ts
// Minimal HTTP seam shared by the real adapters. Kept independent of the DOM lib so the
// package type-checks with `lib: ES2022` only; the default impl wraps Node's global fetch.
import { ProviderError } from "./types";
import type { RetryOptions } from "./retry";

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface HttpRequest {
  method: string;
  headers: Record<string, string>;
  // Absent for GET requests (undici rejects a GET carrying a body, even an empty string).
  body?: string;
  signal?: unknown;
}

export type FetchLike = (url: string, init: HttpRequest) => Promise<HttpResponse>;

// Per-request cap so a hung provider can't stall the pipeline; a fired timeout aborts the
// fetch, which postJson maps to a retryable "errore di rete". Kept well under the scrape time
// budget so a single slow/hung call (e.g. an oversized page) can't eat a large slice of the run's
// ~270s — it fails fast and the grant is retried next run instead.
export const DEFAULT_TIMEOUT_MS = 35_000;

// Config every adapter accepts. `fetchImpl` and `retry` are injected in tests.
export interface ProviderConfig {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
  retry?: RetryOptions;
  // Gemini-only: token budget for 2.5 "thinking". 0 disables it (the default for extraction).
  // Ignored by adapters that have no equivalent.
  thinkingBudget?: number;
}

// Wraps Node's global fetch behind FetchLike (cast at the boundary to avoid a DOM-lib dep).
export const defaultFetch: FetchLike = (url, init) =>
  (globalThis.fetch as unknown as (u: string, i: HttpRequest) => Promise<HttpResponse>)(url, init);

export interface PostJsonArgs {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  providerName: string;
  signal?: unknown;
}

// Performs a JSON POST and classifies the outcome into ProviderError:
//   network failure / 429 / 5xx  -> retryable
//   other non-2xx                -> non-retryable (bad request, auth, etc.)
// On success returns the parsed provider envelope (unknown).
export async function postJson(fetchImpl: FetchLike, args: PostJsonArgs): Promise<unknown> {
  let res: HttpResponse;
  try {
    res = await fetchImpl(args.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...args.headers },
      body: JSON.stringify(args.body),
      signal: args.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ProviderError(`${args.providerName}: errore di rete`, { retryable: true, cause });
  }

  if (res.status === 429 || res.status >= 500) {
    throw new ProviderError(`${args.providerName}: HTTP ${res.status}`, { retryable: true });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(`${args.providerName}: HTTP ${res.status} ${detail}`.trim(), { retryable: false });
  }
  try {
    return await res.json();
  } catch (cause) {
    throw new ProviderError(`${args.providerName}: risposta non-JSON`, { retryable: false, cause });
  }
}

// Parses the model's text output; a truncated/invalid JSON string is a non-retryable error.
export function parseJsonText(text: string, providerName: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ProviderError(`${providerName}: JSON del modello non valido o troncato`, { retryable: false, cause });
  }
}

// Narrows unknown to a plain object for safe envelope traversal.
export function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

// The pipeline wants a top-level array. JSON-mode providers return an object, so accept
// either the array itself or a `{ grants: [...] }` wrapper; otherwise pass the value through.
export function unwrapGrants(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  const grants = record(parsed)?.grants;
  return Array.isArray(grants) ? grants : parsed;
}
