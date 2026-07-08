import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const consumeAnalysisQuota = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  consumeAnalysisQuota: (...a: unknown[]) => consumeAnalysisQuota(...a),
}));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn(async () => null) }));

import { POST as analyzePost } from "../analyze/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  consumeAnalysisQuota.mockReset();
});

describe("POST /api/ai/analyze", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await analyzePost(post({ grantId: "g1" }));
    expect(res.status).toBe(401);
    expect(consumeAnalysisQuota).not.toHaveBeenCalled();
  });

  it("returns 429 when the hourly quota is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    consumeAnalysisQuota.mockResolvedValue({ allowed: false });
    const res = await analyzePost(post({ grantId: "g1" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/limite orario/i);
  });

  it("returns 400 on a missing grantId", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await analyzePost(post({}));
    expect(res.status).toBe(400);
  });
});
