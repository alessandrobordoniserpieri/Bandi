import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));

import { GET } from "../status/route";
import { getGrant } from "@/lib/grants/queries";
import type { GrantView } from "@/lib/grants/mapping";

function get(grantId?: string): Request {
  const url = new URL("http://localhost/api/ai/strong/status");
  if (grantId) url.searchParams.set("grantId", grantId);
  return new Request(url);
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  vi.mocked(getGrant).mockReset();
});

function mockTables(profile: unknown, documentRows: unknown[]) {
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) };
    }
    if (table === "grant_documents") {
      return { select: () => ({ eq: async () => ({ data: documentRows }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("GET /api/ai/strong/status", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(get("g1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when grantId is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(get());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ user_id: "u1" }, []);
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await GET(get("g1"));
    expect(res.status).toBe(404);
  });

  it("reports readiness derived from the grant's PDFs and its document rows", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ user_id: "u1" }, [{ status: "ready" }]);
    vi.mocked(getGrant).mockResolvedValue(
      {
        grant: { id: "g1", attachments: [{ title: "A.pdf", url: "https://x/a.pdf", mimeType: "application/pdf" }] },
        providerName: null,
      } as unknown as GrantView,
    );
    const res = await GET(get("g1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("ready");
  });
});
