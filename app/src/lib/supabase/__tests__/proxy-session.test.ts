import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

vi.mock("next/server", () => {
  class FakeResponse {
    redirected?: string;
    isNext = false;
    cookies = { set: vi.fn() };
    constructor(redirected?: string, isNext = false) {
      this.redirected = redirected;
      this.isNext = isNext;
    }
  }
  return {
    NextResponse: {
      next: () => new FakeResponse(undefined, true),
      redirect: (url: URL) => new FakeResponse(url.pathname, false),
    },
  };
});

import { updateSession } from "../proxy-session";

function fakeRequest(pathname: string) {
  return {
    cookies: { getAll: () => [], set: vi.fn() },
    nextUrl: {
      pathname,
      clone: () => new URL(`https://x.test${pathname}`),
    },
    // used by NextResponse.next({ request }) in the real code; irrelevant to the mock
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("updateSession routing", () => {
  it("unauthenticated on a protected route → redirected to /login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = (await updateSession(fakeRequest("/profilo"))) as unknown as { redirected?: string };
    expect(res.redirected).toBe("/login");
  });

  it("unauthenticated on /recupera-password → not redirected (public)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = (await updateSession(fakeRequest("/recupera-password"))) as unknown as { redirected?: string };
    expect(res.redirected).toBeUndefined();
  });

  it("unauthenticated on /aggiorna-password → not redirected (always accessible)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = (await updateSession(fakeRequest("/aggiorna-password"))) as unknown as { redirected?: string };
    expect(res.redirected).toBeUndefined();
  });

  it("authenticated on /recupera-password → redirected home", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = (await updateSession(fakeRequest("/recupera-password"))) as unknown as { redirected?: string };
    expect(res.redirected).toBe("/");
  });

  it("authenticated on /aggiorna-password → NOT redirected away (must be reachable via recovery session)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = (await updateSession(fakeRequest("/aggiorna-password"))) as unknown as { redirected?: string };
    expect(res.redirected).toBeUndefined();
  });

  it("authenticated on /login → redirected home", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = (await updateSession(fakeRequest("/login"))) as unknown as { redirected?: string };
    expect(res.redirected).toBe("/");
  });

  it("unauthenticated on an /api/* route → NOT redirected (routes handle their own auth and must return JSON)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = (await updateSession(fakeRequest("/api/cron/scrape"))) as unknown as { redirected?: string };
    expect(res.redirected).toBeUndefined();
  });

  it("unauthenticated on /api/ai/analyze → NOT redirected", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = (await updateSession(fakeRequest("/api/ai/analyze"))) as unknown as { redirected?: string };
    expect(res.redirected).toBeUndefined();
  });
});
