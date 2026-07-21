import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();
const checkEntitlement = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/ai/entitlement", () => ({ checkEntitlement: (...a: unknown[]) => checkEntitlement(...a) }));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));
vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>("@/lib/ai/provider");
  return { ...actual, getProvider: vi.fn() };
});

import { POST } from "../chat/route";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import type { GrantView } from "@/lib/grants/mapping";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/strong/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const grantView: GrantView = {
  grant: {
    id: "g1", title: "Bando", providerId: null, providerKind: null, deadline: null,
    status: "aperto", grantType: "bando", amount: null, cofundingRequired: null,
    cofundingPercentage: null, eligibleTypes: [], tags: [], area: null, geoScope: null,
    complexity: null, requiredDocuments: [], summary: "", requirements: "", url: "https://x",
    beneficiaries: "", openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
    eligibleExpenses: null, applicationMethod: null, contactInfo: null, attachments: [],
  },
  providerName: null,
};

const profileRow = {
  user_id: "u1", legal_type: "APS", themes: [], operating_provinces: [],
  project_history: [], income_sources: [], beneficiaries: [],
};

let insertedRows: Record<string, unknown>[] = [];

function mockTables(opts: { documentRows?: unknown[]; historyRows?: unknown[] } = {}) {
  insertedRows = [];
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }) }) };
    }
    if (table === "grant_documents") {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: opts.documentRows ?? [] }) }) }) };
    }
    if (table === "chat_messages") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: opts.historyRows ?? [] }) }) }) }),
        insert: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  checkEntitlement.mockReset();
  vi.mocked(getGrant).mockReset();
  vi.mocked(getProvider).mockReset();
});

describe("POST /api/ai/strong/chat", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ grantId: "g1", message: "ciao" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when message or grantId is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when the hourly chat entitlement is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: false });
    const res = await POST(post({ grantId: "g1", message: "ciao" }));
    expect(res.status).toBe(429);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await POST(post({ grantId: "missing", message: "ciao" }));
    expect(res.status).toBe(404);
  });

  it("persists the user message, calls the LLM with history+documents, persists the reply", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({
      documentRows: [{ attachment_url: "https://x/a.pdf", extracted_text: "Testo XYZ999" }],
      historyRows: [{ role: "user", content: "Prima domanda" }, { role: "assistant", content: "Prima risposta" }],
    });
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(grantView);
    let capturedHtml = "";
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async (args: { html: string }) => {
        capturedHtml = args.html;
        return { risposta: "Ecco la risposta." };
      },
    });

    const res = await POST(post({ grantId: "g1", message: "Seconda domanda?" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Ecco la risposta.");
    expect(capturedHtml).toContain("Testo XYZ999");
    expect(capturedHtml).toContain("Prima domanda");
    expect(capturedHtml).toContain("Seconda domanda?");
    expect(insertedRows).toEqual([
      { grant_id: "g1", user_id: "u1", role: "user", content: "Seconda domanda?" },
      { grant_id: "g1", user_id: "u1", role: "assistant", content: "Ecco la risposta." },
    ]);
  });

  it("returns 502 (user message still persisted) when the LLM call fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(grantView);
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async () => { throw new Error("provider down"); },
    });

    const res = await POST(post({ grantId: "g1", message: "ciao" }));

    expect(res.status).toBe(502);
    expect(insertedRows).toEqual([{ grant_id: "g1", user_id: "u1", role: "user", content: "ciao" }]);
  });
});
