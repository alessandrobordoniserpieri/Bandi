import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const checkEntitlement = vi.fn();
const embed = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, rpc }),
}));
vi.mock("@/lib/ai/entitlement", () => ({ checkEntitlement: (...a: unknown[]) => checkEntitlement(...a) }));
vi.mock("@/lib/ai/embedding-provider", () => ({ getEmbeddingProvider: () => ({ embed }) }));
vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>("@/lib/ai/provider");
  return { ...actual, getProvider: vi.fn() };
});

import { GET, POST } from "../cross-chat/route";
import { getProvider } from "@/lib/ai/provider";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/strong/cross-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const profileRow = {
  user_id: "u1", legal_type: "APS", themes: [], operating_provinces: [],
  project_history: [], income_sources: [], beneficiaries: [],
};

let insertedRows: Record<string, unknown>[] = [];

function mockTables(opts: { savedGrantIds?: string[]; history?: unknown[]; grantTitles?: unknown[] } = {}) {
  insertedRows = [];
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }) }) };
    }
    if (table === "saved_grants") {
      return { select: () => ({ eq: async () => ({ data: (opts.savedGrantIds ?? []).map((id) => ({ grant_id: id })) }) }) };
    }
    if (table === "grants") {
      return { select: () => ({ in: async () => ({ data: opts.grantTitles ?? [] }) }) };
    }
    if (table === "cross_chat_messages") {
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: opts.history ?? [] }) }) }),
        insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: null }); },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  getUser.mockReset(); from.mockReset(); rpc.mockReset(); checkEntitlement.mockReset(); embed.mockReset();
  vi.mocked(getProvider).mockReset();
});

describe("POST /api/ai/strong/cross-chat", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ message: "ciao" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when message is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it("returns a guidance reply (no LLM, no entitlement) when the user has no saved grants", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ savedGrantIds: [] });
    const res = await POST(post({ message: "confronta i miei bandi" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toMatch(/salv/i);
    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });

  it("returns 429 when the chat credit balance is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({ savedGrantIds: ["g1"] });
    checkEntitlement.mockResolvedValue({ allowed: false });
    const res = await POST(post({ message: "confronta" }));
    expect(res.status).toBe(429);
    expect(embed).not.toHaveBeenCalled();
  });

  it("retrieves chunks, calls the LLM, persists both messages, returns reply + sources", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({
      savedGrantIds: ["g1", "g2"],
      history: [{ role: "user", content: "domanda precedente" }],
      grantTitles: [{ id: "g1", title: "Bando Sport" }, { id: "g2", title: "Bando Inclusione" }],
    });
    checkEntitlement.mockResolvedValue({ allowed: true });
    embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    rpc.mockResolvedValue({ data: [
      { grant_id: "g1", document_id: "d1", chunk_text: "testo sport", similarity: 0.9 },
      { grant_id: "g2", document_id: "d2", chunk_text: "testo inclusione", similarity: 0.8 },
    ] });
    let capturedHtml = "";
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async (args: { html: string }) => { capturedHtml = args.html; return { risposta: "Il Bando Sport è il più adatto." }; },
    });

    const res = await POST(post({ message: "quale bando per lo sport?" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Il Bando Sport è il più adatto.");
    expect(body.sources).toEqual([
      { grantId: "g1", grantTitle: "Bando Sport" },
      { grantId: "g2", grantTitle: "Bando Inclusione" },
    ]);
    expect(embed).toHaveBeenCalledWith(["quale bando per lo sport?"]);
    expect(rpc).toHaveBeenCalledWith("match_grant_chunks", expect.objectContaining({ grant_ids: ["g1", "g2"] }));
    expect(capturedHtml).toContain("testo sport");
    expect(capturedHtml).toContain("domanda precedente");
    expect(insertedRows).toEqual([
      { user_id: "u1", role: "user", content: "quale bando per lo sport?" },
      { user_id: "u1", role: "assistant", content: "Il Bando Sport è il più adatto." },
    ]);
  });
});

describe("GET /api/ai/strong/cross-chat", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request("http://localhost/api/ai/strong/cross-chat"));
    expect(res.status).toBe(401);
  });

  it("returns the stored cross-chat history for the user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    from.mockImplementation((table: string) => {
      if (table !== "cross_chat_messages") throw new Error(`unexpected ${table}`);
      return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ role: "user", content: "ciao" }] }) }) }) };
    });
    const res = await GET(new Request("http://localhost/api/ai/strong/cross-chat"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([{ role: "user", content: "ciao" }]);
  });
});
