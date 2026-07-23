import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const getCreditBalance = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  redirect: () => {
    throw new Error("redirect() should not be called for an authenticated, onboarded user");
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

vi.mock("@/lib/ai/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
}));

vi.mock("../(auth)/actions", () => ({ signOut: async () => {} }));

import AppLayout from "../layout";

beforeEach(() => {
  getUser.mockReset();
  maybeSingle.mockReset();
  getCreditBalance.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  maybeSingle.mockResolvedValue({ data: { id: "profile-1" } });
});

describe("AppLayout credits widget (DEC-6)", () => {
  it("passes the real free+paid total from getCreditBalance, not a placeholder", async () => {
    getCreditBalance.mockResolvedValue({ free: 82, paid: 5, total: 87 });
    const jsx = await AppLayout({ children: <div>content</div> });
    const html = renderToStaticMarkup(jsx);
    expect(getCreditBalance).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(html).toContain("87");
    expect(html).not.toContain(">12<"); // the old hardcoded PLACEHOLDER_CREDITS value
  });
});
