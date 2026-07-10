// scraper/src/pipeline/throttle.ts

export interface ThrottleOptions {
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ThrottledResult<T> {
  results: (T | null)[];
  errors: string[];
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

  return { results, errors };
}
