import { describe, it, expect } from "vitest";
import { consumeCredit, getCreditBalance, FREE_MONTHLY_CREDITS } from "../credits";

function fakeAdmin(initial: Record<string, unknown> | null) {
  let row = initial;
  const transactions: Record<string, unknown>[] = [];
  const api = {
    from(table: string) {
      if (table === "user_credits") {
        return {
          select() {
            return { eq: () => ({ maybeSingle: async () => ({ data: row }) }) };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq: async () => {
                row = { ...(row ?? {}), ...patch };
                return { error: null };
              },
            };
          },
          insert(patch: Record<string, unknown>) {
            row = { ...patch };
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "credit_transactions") {
        return {
          insert(t: Record<string, unknown>) {
            transactions.push(t);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _row: () => row,
    _transactions: () => transactions,
  };
  return api;
}

const NOW = new Date("2026-07-21T12:00:00Z");

describe("getCreditBalance", () => {
  it("reports the full free allowance for a brand-new user (no row yet)", async () => {
    const admin = fakeAdmin(null);
    const balance = await getCreditBalance(admin as never, "u1", NOW);
    expect(balance).toEqual({ free: FREE_MONTHLY_CREDITS, paid: 0, total: FREE_MONTHLY_CREDITS });
  });

  it("reports the stored balance within the same period", async () => {
    const admin = fakeAdmin({ free_balance: 40, free_period_start: NOW.toISOString(), paid_balance: 5 });
    const balance = await getCreditBalance(admin as never, "u1", NOW);
    expect(balance).toEqual({ free: 40, paid: 5, total: 45 });
  });

  it("reports the RESET free allowance once the period has rolled over, without writing", async () => {
    const admin = fakeAdmin({ free_balance: 0, free_period_start: "2026-06-15T00:00:00Z", paid_balance: 5 });
    const balance = await getCreditBalance(admin as never, "u1", NOW);
    expect(balance).toEqual({ free: FREE_MONTHLY_CREDITS, paid: 5, total: FREE_MONTHLY_CREDITS + 5 });
  });
});

describe("consumeCredit", () => {
  it("spends from the free pool first, for a brand-new user", async () => {
    const admin = fakeAdmin(null);
    const res = await consumeCredit(admin as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    const row = admin._row() as Record<string, unknown>;
    expect(row.free_balance).toBe(FREE_MONTHLY_CREDITS - 1);
    expect(row.paid_balance).toBe(0);
    expect(admin._transactions()).toEqual([{ user_id: "u1", delta: -1, reason: "chat_message" }]);
  });

  it("spends from the free pool when it has balance, leaving paid untouched", async () => {
    const admin = fakeAdmin({ free_balance: 10, free_period_start: NOW.toISOString(), paid_balance: 5 });
    const res = await consumeCredit(admin as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    const row = admin._row() as Record<string, unknown>;
    expect(row.free_balance).toBe(9);
    expect(row.paid_balance).toBe(5);
  });

  it("falls back to the paid pool once free is exhausted", async () => {
    const admin = fakeAdmin({ free_balance: 0, free_period_start: NOW.toISOString(), paid_balance: 5 });
    const res = await consumeCredit(admin as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    const row = admin._row() as Record<string, unknown>;
    expect(row.free_balance).toBe(0);
    expect(row.paid_balance).toBe(4);
  });

  it("blocks (writes nothing) when both pools are empty", async () => {
    const admin = fakeAdmin({ free_balance: 0, free_period_start: NOW.toISOString(), paid_balance: 0 });
    const res = await consumeCredit(admin as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(false);
    const row = admin._row() as Record<string, unknown>;
    expect(row.free_balance).toBe(0);
    expect(row.paid_balance).toBe(0);
    expect(admin._transactions()).toEqual([]);
  });

  it("resets the free pool to the full monthly allowance when the period has rolled over", async () => {
    const admin = fakeAdmin({ free_balance: 0, free_period_start: "2026-06-15T00:00:00Z", paid_balance: 0 });
    const res = await consumeCredit(admin as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    const row = admin._row() as Record<string, unknown>;
    expect(row.free_balance).toBe(FREE_MONTHLY_CREDITS - 1);
    expect(row.free_period_start).toBe(NOW.toISOString());
  });
});
