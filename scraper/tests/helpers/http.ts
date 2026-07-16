// Test helpers: build mock HttpResponse / FetchLike for the provider adapters.
import type { FetchLike, HttpRequest, HttpResponse } from "../../src/providers/http";

export interface RecordedRequest {
  url: string;
  init: HttpRequest;
}

// Mirrors a real fetch Response closely enough for postJson: json() re-parses the body text,
// so passing a non-JSON string body exercises the "risposta non-JSON" path.
export function mockResponse(status: number, body: unknown): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text) as unknown;
    },
  };
}

// A FetchLike that returns the given responses in order (repeating the last once exhausted)
// and records every request for assertions. `retry: { sleep }` in the adapter config keeps
// backoff instant in tests.
export function mockFetch(responses: HttpResponse[]): {
  fetchImpl: FetchLike;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    const res = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!res) throw new Error("mockFetch: no response configured");
    return res;
  };
  return { fetchImpl, requests };
}

// The no-wait retry config used across adapter tests.
export const noWaitRetry = { retry: { sleep: async () => {} } };

export function bodyOf(req: RecordedRequest): Record<string, unknown> {
  return JSON.parse(req.init.body ?? "null") as Record<string, unknown>;
}
