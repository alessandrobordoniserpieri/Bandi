import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeCredit = vi.fn();
vi.mock("../credits", () => ({ consumeCredit: (...a: unknown[]) => consumeCredit(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

import { checkEntitlement, LIMITS } from "../entitlement";

// Minimal in-memory fake of the Supabase query builder subset entitlement uses for the
// rate-limited actions (quick_analysis, extraction):
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

beforeEach(() => {
  consumeCredit.mockReset();
});

describe("checkEntitlement — chat_message (credits, V2-B)", () => {
  it("delegates to the credit ledger, spending under the 'chat_message' reason", async () => {
    consumeCredit.mockResolvedValue({ allowed: true });
    const sb = fakeSupabase(null);
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect(consumeCredit).toHaveBeenCalledWith(expect.anything(), "u1", "chat_message", NOW);
  });

  it("blocks when the credit ledger reports no balance left", async () => {
    consumeCredit.mockResolvedValue({ allowed: false });
    const sb = fakeSupabase(null);
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(false);
  });

  it("never touches user_settings for chat_message (no rate-limit bucket anymore)", async () => {
    consumeCredit.mockResolvedValue({ allowed: true });
    const sb = fakeSupabase(null);
    await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(sb._row()).toBeNull();
  });
});

describe("checkEntitlement — quick_analysis / extraction (still rate-limited)", () => {
  it("allows a call when under the hourly limit and increments the counter", async () => {
    const sb = fakeSupabase({ ai_calls_count: 0, ai_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "quick_analysis", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().ai_calls_count).toBe(1);
  });

  it("blocks a call once the hourly limit is reached", async () => {
    const sb = fakeSupabase({ ai_calls_count: LIMITS.quick_analysis.max, ai_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "quick_analysis", NOW);
    expect(res.allowed).toBe(false);
  });

  it("resets the counter to 1 when the hourly window has expired", async () => {
    const old = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ ai_calls_count: LIMITS.quick_analysis.max, ai_calls_window_start: old });
    const res = await checkEntitlement(sb as never, "u1", "quick_analysis", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().ai_calls_count).toBe(1);
  });

  it("extraction uses a 24h window, not 1h (still blocked after 2h at the cap)", async () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ extraction_count: LIMITS.extraction.max, extraction_window_start: twoHoursAgo });
    const res = await checkEntitlement(sb as never, "u1", "extraction", NOW);
    expect(res.allowed).toBe(false); // 2h < 24h → window NOT expired → still capped
  });

  it("creates the settings row on first use when none exists", async () => {
    const sb = fakeSupabase(null);
    const res = await checkEntitlement(sb as never, "u1", "extraction", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().extraction_count).toBe(1);
  });
});
