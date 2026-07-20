import { describe, it, expect } from "vitest";
import { checkEntitlement, LIMITS } from "../entitlement";

// Minimal in-memory fake of the Supabase query builder subset entitlement uses:
// from("user_settings").select(...).eq("user_id", id).maybeSingle()  → { data }
// from("user_settings").insert(row)                                   → { error: null }
// from("user_settings").update(row).eq("user_id", id)                → { error: null }
function fakeSupabase(initial: Record<string, unknown> | null) {
  let row = initial;
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle() { return Promise.resolve({ data: row }); },
    insert(r: Record<string, unknown>) { row = { ...r }; return Promise.resolve({ error: null }); },
    update(r: Record<string, unknown>) { row = { ...(row ?? {}), ...r }; return { eq: () => Promise.resolve({ error: null }) }; },
    _row: () => row,
  };
  return api;
}

const NOW = new Date("2026-07-20T12:00:00Z");

describe("checkEntitlement — chat_message (hourly bucket)", () => {
  it("allows a call when under the hourly limit and increments the counter", async () => {
    const sb = fakeSupabase({ chat_calls_count: 0, chat_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });

  it("blocks a call once the hourly limit is reached", async () => {
    const sb = fakeSupabase({ chat_calls_count: LIMITS.chat_message.max, chat_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(false);
  });
});

describe("checkEntitlement — window reset & daily bucket", () => {
  it("resets the counter to 1 when the hourly window has expired", async () => {
    const old = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ chat_calls_count: LIMITS.chat_message.max, chat_calls_window_start: old });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });

  it("extraction uses a 24h window, not 1h (still blocked after 2h at the cap)", async () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ extraction_count: LIMITS.extraction.max, extraction_window_start: twoHoursAgo });
    const res = await checkEntitlement(sb as never, "u1", "extraction", NOW);
    expect(res.allowed).toBe(false); // 2h < 24h → window NOT expired → still capped
  });

  it("creates the settings row on first use when none exists", async () => {
    const sb = fakeSupabase(null);
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });
});
