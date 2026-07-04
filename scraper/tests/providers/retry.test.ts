import { describe, it, expect } from "vitest";
import { withRetry } from "../../src/providers/retry";
import { ProviderError } from "../../src/providers/types";

describe("withRetry", () => {
  it("retries a retryable ProviderError and eventually succeeds", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new ProviderError("boom", { retryable: true });
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([500, 1000]); // exponential backoff before attempts 2 and 3
  });

  it("gives up after 3 attempts on persistent retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new ProviderError("boom", { retryable: true });
        },
        { sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(3);
  });

  it("does not retry a non-retryable ProviderError", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw new ProviderError("bad request", { retryable: false });
      }, { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });

  it("does not retry a plain Error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw new Error("nope");
      }, { sleep: async () => {} }),
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });
});
