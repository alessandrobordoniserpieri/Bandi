// scraper/src/pipeline/throttle.ts

export interface ThrottleOptions {
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
  // Checked before each item; when it returns true the loop stops early (remaining items are left
  // untouched). Used to honor the time budget mid-loop. `stoppedAt` reports the index reached.
  shouldStop?: () => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ThrottledResult<T> {
  results: (T | null)[];
  errors: string[];
  // Number of items not processed because shouldStop() fired (0 when the loop ran to completion).
  stoppedShort: number;
}

export async function throttledLoop<T>(
  items: readonly { id: string; label: string }[],
  fn: (item: { id: string; label: string }) => Promise<T>,
  opts: ThrottleOptions,
): Promise<ThrottledResult<T>> {
  const sleep = opts.sleep ?? defaultSleep;
  const results: (T | null)[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    if (opts.shouldStop?.()) {
      return { results, errors, stoppedShort: items.length - i };
    }
    const item = items[i]!;
    try {
      results.push(await fn(item));
    } catch (err) {
      errors.push(`${item.label}: ${err instanceof Error ? err.message : String(err)}`);
      results.push(null);
    }
    if (i < items.length - 1) {
      await sleep(opts.delayMs);
    }
  }

  return { results, errors, stoppedShort: 0 };
}
