import { describe, it, expect } from "vitest";
import { throttledLoop } from "../src/pipeline/throttle";

const items = [
  { id: "1", label: "one" },
  { id: "2", label: "two" },
  { id: "3", label: "three" },
];
const noSleep = async () => {};

describe("throttledLoop", () => {
  it("runs every item and reports stoppedShort 0 when nothing stops it", async () => {
    const seen: string[] = [];
    const out = await throttledLoop(items, async (i) => { seen.push(i.id); return i.id; }, { delayMs: 0, sleep: noSleep });
    expect(seen).toEqual(["1", "2", "3"]);
    expect(out.stoppedShort).toBe(0);
    expect(out.results).toEqual(["1", "2", "3"]);
  });

  it("stops early when shouldStop fires, leaving remaining items untouched", async () => {
    const seen: string[] = [];
    const out = await throttledLoop(
      items,
      async (i) => { seen.push(i.id); return i.id; },
      { delayMs: 0, sleep: noSleep, shouldStop: () => seen.length >= 2 },
    );
    expect(seen).toEqual(["1", "2"]);      // third never ran
    expect(out.stoppedShort).toBe(1);       // one item skipped
  });

  it("stops before doing any work when shouldStop is true from the start", async () => {
    const seen: string[] = [];
    const out = await throttledLoop(
      items,
      async (i) => { seen.push(i.id); return i.id; },
      { delayMs: 0, sleep: noSleep, shouldStop: () => true },
    );
    expect(seen).toEqual([]);
    expect(out.stoppedShort).toBe(3);
  });

  it("collects per-item errors without throwing", async () => {
    const out = await throttledLoop(
      items,
      async (i) => { if (i.id === "2") throw new Error("bad"); return i.id; },
      { delayMs: 0, sleep: noSleep },
    );
    expect(out.errors).toEqual(["two: bad"]);
    expect(out.results).toEqual(["1", null, "3"]);
    expect(out.stoppedShort).toBe(0);
  });
});
