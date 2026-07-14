// scraper/src/providers/throttle-provider.ts
import type { LLMProvider } from "./types";

export interface ThrottleClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: ThrottleClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

// Wraps an LLMProvider so its extract() calls are spaced at least minIntervalMs apart, measured
// start-to-start (so a call slower than the interval incurs no extra wait). This puts the whole
// LLM rate limit under a SINGLE gate covering both the listing-chunk calls and the detail calls —
// previously only the detail phase was throttled, and a multi-chunk listing page fired its Gemini
// calls back-to-back with no pause. Calls are serialized through an internal chain so the spacing
// holds even if two extract() calls overlap.
export function throttleProvider(
  inner: LLMProvider,
  minIntervalMs: number,
  clock: ThrottleClock = realClock,
): LLMProvider {
  if (minIntervalMs <= 0) return inner;
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return {
    name: inner.name,
    extract(input) {
      const run = async (): Promise<unknown> => {
        const wait = lastStart + minIntervalMs - clock.now();
        if (wait > 0) await clock.sleep(wait);
        lastStart = clock.now();
        return inner.extract(input);
      };
      const result = chain.then(run, run);
      // Keep the chain alive regardless of this call's outcome, so one failure does not wedge
      // the gate for every subsequent call.
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
