import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const profileFrom = vi.fn();
const checkEntitlement = vi.fn();
const adminSelect = vi.fn();
const adminUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: profileFrom }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "grant_documents") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => adminSelect() }),
        upsert: (rows: unknown, opts: unknown) => adminUpsert(rows, opts),
      };
    },
  }),
}));
vi.mock("@/lib/ai/entitlement", () => ({ checkEntitlement: (...a: unknown[]) => checkEntitlement(...a) }));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));

import { POST } from "../prepare/route";
import { getGrant } from "@/lib/grants/queries";
import type { GrantView } from "@/lib/grants/mapping";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/strong/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const grantWithPdf = {
  grant: {
    id: "g1",
    attachments: [{ title: "Avviso.pdf", url: "https://x/avviso.pdf", mimeType: "application/pdf" }],
  },
  providerName: "Fondazione Test",
} as unknown as GrantView;

beforeEach(() => {
  getUser.mockReset();
  profileFrom.mockReset();
  checkEntitlement.mockReset();
  adminSelect.mockReset();
  adminUpsert.mockReset();
  vi.mocked(getGrant).mockReset();
  profileFrom.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u1" } }) }) }),
  });
});

describe("POST /api/ai/strong/prepare", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a missing grantId", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await POST(post({ grantId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns no_documents without touching entitlement/DB when the grant has no PDFs", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(
      { grant: { id: "g1", attachments: [] }, providerName: null } as unknown as GrantView,
    );
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("no_documents");
    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(adminUpsert).not.toHaveBeenCalled();
  });

  it("creates pending rows and consumes the extraction entitlement on first trigger", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [] }); // no existing rows yet
    checkEntitlement.mockResolvedValue({ allowed: true });
    adminUpsert.mockResolvedValue({ error: null });

    const res = await POST(post({ grantId: "g1" }));

    expect(checkEntitlement).toHaveBeenCalledWith(expect.anything(), "u1", "extraction");
    expect(adminUpsert).toHaveBeenCalledTimes(1);
    const [rows] = adminUpsert.mock.calls[0]!;
    expect(rows).toEqual([{ grant_id: "g1", attachment_url: "https://x/avviso.pdf", status: "pending" }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toBe("preparing");
  });

  it("skips entitlement and DB writes when every attachment is already tracked", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [{ attachment_url: "https://x/avviso.pdf", status: "ready" }] });

    const res = await POST(post({ grantId: "g1" }));

    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(adminUpsert).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.readiness).toBe("ready");
  });

  it("returns 429 when the daily extraction entitlement is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(getGrant).mockResolvedValue(grantWithPdf);
    adminSelect.mockResolvedValue({ data: [] });
    checkEntitlement.mockResolvedValue({ allowed: false });

    const res = await POST(post({ grantId: "g1" }));

    expect(res.status).toBe(429);
    expect(adminUpsert).not.toHaveBeenCalled();
  });
});
