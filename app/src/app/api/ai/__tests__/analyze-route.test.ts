import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const consumeAnalysisQuota = vi.fn();
const profileFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: profileFrom }),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  consumeAnalysisQuota: (...a: unknown[]) => consumeAnalysisQuota(...a),
}));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn(async () => null) }));
vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>("@/lib/ai/provider");
  return { ...actual, getProvider: vi.fn() };
});

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
  profileFrom.mockReset();
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

describe("POST /api/ai/analyze with ready documents", () => {
  it("includes the extracted PDF text in the document sent to the provider", async () => {
    const { getProvider } = await import("@/lib/ai/provider");
    let capturedHtml = "";
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async (args: { html: string }) => {
        capturedHtml = args.html;
        return {
          punti_di_forza: ["ok"], rischi: [], suggerimenti: [], passi_successivi: [],
        };
      },
    });

    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    consumeAnalysisQuota.mockResolvedValue({ allowed: true });
    const { getGrant } = await import("@/lib/grants/queries");
    vi.mocked(getGrant).mockResolvedValue({
      grant: {
        id: "g1", title: "Bando", providerId: null, providerKind: null, deadline: null,
        status: "aperto", grantType: "bando", amount: null, cofundingRequired: null,
        cofundingPercentage: null, eligibleTypes: [], tags: [], area: null, geoScope: null,
        complexity: null, requiredDocuments: [], summary: "", requirements: "", url: "https://x",
        beneficiaries: "", openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
        eligibleExpenses: null, applicationMethod: null, contactInfo: null,
        attachments: [{ title: "Avviso.pdf", url: "https://x/avviso.pdf", mimeType: "application/pdf" }],
      },
      providerName: null,
    });

    profileFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: "u1", legal_type: "APS", themes: [], operating_provinces: [], project_history: [], income_sources: [], beneficiaries: [] },
              }),
            }),
          }),
        };
      }
      if (table === "grant_documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{ attachment_url: "https://x/avviso.pdf", extracted_text: "Testo unico riconoscibile XYZ123" }],
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await analyzePost(post({ grantId: "g1" }));
    expect(res.status).toBe(200);
    expect(capturedHtml).toContain("Testo unico riconoscibile XYZ123");
  });
});
