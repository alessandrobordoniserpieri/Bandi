import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("admin client must not be created for a 401"); },
}));

import { POST as submitPost } from "../submit-url/route";

beforeEach(() => getUser.mockReset());

describe("POST /api/grants/submit-url", () => {
  it("returns 401 when unauthenticated (before touching the admin client)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await submitPost(
      new Request("http://localhost/api/grants/submit-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", url: "https://esempio.it" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
