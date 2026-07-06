import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const upsert = vi.fn();
const del = vi.fn();
const update = vi.fn();
let currentStatus: string | null = "candidato";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc: (...a: unknown[]) => { rpc(...a); return { error: null }; },
    from: () => ({
      upsert: (...a: unknown[]) => { upsert(...a); return { error: null }; },
      delete: () => ({ eq: () => ({ eq: (...a: unknown[]) => { del(...a); return { error: null }; } }) }),
      update: (row: unknown) => { update(row); return { eq: () => ({ eq: () => ({ error: null }) }) }; },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: currentStatus ? { status: currentStatus } : null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (p: string) => { throw new Error(`REDIRECT:${p}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveGrant, removeSavedGrant, updateStatus, updateNotes } from "../actions";

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockClear(); upsert.mockClear(); del.mockClear(); update.mockClear();
  currentStatus = "candidato";
});

describe("saveGrant", () => {
  it("upserts (user, grant) ignoring duplicates", async () => {
    const res = await saveGrant("g1");
    expect(res).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", grant_id: "g1" },
      { onConflict: "user_id,grant_id", ignoreDuplicates: true },
    );
  });
});

describe("removeSavedGrant", () => {
  it("deletes by grant id", async () => {
    const res = await removeSavedGrant("g1");
    expect(res).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith("grant_id", "g1");
  });
});

describe("updateNotes", () => {
  it("saves trimmed notes", async () => {
    await updateNotes("s1", "ciao");
    expect(update).toHaveBeenCalledWith({ notes: "ciao" });
  });
  it("stores null for blank notes", async () => {
    await updateNotes("s1", "   ");
    expect(update).toHaveBeenCalledWith({ notes: null });
  });
});

describe("updateStatus", () => {
  it("calls the RPC on a valid transition", async () => {
    currentStatus = "candidato";
    const res = await updateStatus("s1", "finanziato");
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_saved_grant_status", {
      p_saved_grant_id: "s1",
      p_status: "finanziato",
    });
  });

  it("rejects an invalid transition without calling the RPC", async () => {
    currentStatus = "salvato";
    const res = await updateStatus("s1", "finanziato");
    expect(res).toEqual({ error: "Transizione di stato non valida." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("errors when the saved grant is not found", async () => {
    currentStatus = null;
    const res = await updateStatus("s1", "candidato");
    expect("error" in res).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});
