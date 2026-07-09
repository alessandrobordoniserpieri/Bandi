import { describe, it, expect, vi, beforeEach } from "vitest";

const set = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}));

import { setDensity } from "../actions";

beforeEach(() => vi.clearAllMocks());

describe("setDensity", () => {
  it("writes the density cookie with a 1-year max age", async () => {
    await setDensity("compact");
    expect(set).toHaveBeenCalledWith("bandi-density", "compact", expect.objectContaining({
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    }));
  });

  it("revalidates the dashboard and nuovi-bandi paths", async () => {
    await setDensity("card");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/nuovi-bandi");
  });
});
