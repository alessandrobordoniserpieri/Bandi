import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const getCreditBalance = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/ai/credits", () => ({ getCreditBalance: (...a: unknown[]) => getCreditBalance(...a) }));

import { GET } from "../credits/route";

beforeEach(() => {
  getUser.mockReset();
  getCreditBalance.mockReset();
});

describe("GET /api/ai/credits", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request("http://localhost/api/ai/credits"));
    expect(res.status).toBe(401);
    expect(getCreditBalance).not.toHaveBeenCalled();
  });

  it("returns the caller's credit balance", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getCreditBalance.mockResolvedValue({ free: 82, paid: 5, total: 87 });
    const res = await GET(new Request("http://localhost/api/ai/credits"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ free: 82, paid: 5, total: 87 });
    expect(getCreditBalance).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
