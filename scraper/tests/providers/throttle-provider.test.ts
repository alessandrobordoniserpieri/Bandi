import { describe, it, expect } from "vitest";
import { throttleProvider, type ThrottleClock } from "../../src/providers/throttle-provider";
import type { LLMProvider } from "../../src/providers/types";

// A controllable fake clock: time only advances when a scheduled sleep is "fired". Sleeps resolve
// immediately but record how long they were asked to wait, and advance virtual time.
function fakeClock(): ThrottleClock & { waits: number[]; t: number } {
  const state = {
    t: 0,
    waits: [] as number[],
    now: () => state.t,
    sleep: async (ms: number) => {
      state.waits.push(ms);
      if (ms > 0) state.t += ms;
    },
  };
  return state;
}

function counting(): LLMProvider & { calls: number } {
  const p = {
    calls: 0,
    name: "fake",
    async extract() {
      p.calls += 1;
      return [{ n: p.calls }];
    },
  };
  return p;
}

describe("throttleProvider", () => {
  it("does not wait before the first call", async () => {
    const clock = fakeClock();
    const throttled = throttleProvider(counting(), 5000, clock);
    await throttled.extract({ html: "a", schema: {}, instructions: "" });
    expect(clock.waits.filter((w) => w > 0)).toEqual([]);
  });

  it("spaces consecutive calls by at least the interval (start-to-start)", async () => {
    const clock = fakeClock();
    const inner = counting();
    const throttled = throttleProvider(inner, 5000, clock);
    await throttled.extract({ html: "a", schema: {}, instructions: "" });
    await throttled.extract({ html: "b", schema: {}, instructions: "" });
    await throttled.extract({ html: "c", schema: {}, instructions: "" });
    expect(inner.calls).toBe(3);
    // Second and third calls each waited a full interval; first did not wait.
    expect(clock.waits.filter((w) => w > 0)).toEqual([5000, 5000]);
  });

  it("adds no extra wait when the previous call already outlasted the interval", async () => {
    const clock = fakeClock();
    const slow: LLMProvider = {
      name: "slow",
      async extract() {
        clock.t += 8000; // the call itself takes longer than the 5s interval
        return [];
      },
    };
    const throttled = throttleProvider(slow, 5000, clock);
    await throttled.extract({ html: "a", schema: {}, instructions: "" });
    await throttled.extract({ html: "b", schema: {}, instructions: "" });
    expect(clock.waits.filter((w) => w > 0)).toEqual([]);
  });

  it("is a no-op passthrough when the interval is zero", () => {
    const inner = counting();
    expect(throttleProvider(inner, 0)).toBe(inner);
  });

  it("keeps spacing intact after a failing call", async () => {
    const clock = fakeClock();
    let call = 0;
    const flaky: LLMProvider = {
      name: "flaky",
      async extract() {
        call += 1;
        if (call === 1) throw new Error("boom");
        return [];
      },
    };
    const throttled = throttleProvider(flaky, 5000, clock);
    await expect(throttled.extract({ html: "a", schema: {}, instructions: "" })).rejects.toThrow("boom");
    await throttled.extract({ html: "b", schema: {}, instructions: "" });
    // The second call still waited a full interval despite the first throwing.
    expect(clock.waits.filter((w) => w > 0)).toEqual([5000]);
  });
});
