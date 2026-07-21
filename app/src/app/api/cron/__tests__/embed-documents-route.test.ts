import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/ai/embedding-batch", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/ai/embedding-batch")>(
    "../../../../lib/ai/embedding-batch",
  );
  return { ...actual, runEmbeddingBatch: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("../../../../lib/ai/embedding-provider", () => ({ getEmbeddingProvider: vi.fn(() => ({ embed: vi.fn() })) }));

import { GET, POST } from "../embed-documents/route";
import { runEmbeddingBatch } from "@/lib/ai/embedding-batch";

function post(auth?: string): Request {
  return new Request("http://localhost/api/cron/embed-documents", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/embed-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret";
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(runEmbeddingBatch).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret (401)", async () => {
    const res = await POST(post("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runEmbeddingBatch).not.toHaveBeenCalled();
  });

  it("runs the batch and returns its counts with the correct secret", async () => {
    vi.mocked(runEmbeddingBatch).mockResolvedValueOnce({ processed: 3, embedded: 2, failed: 1 });
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(runEmbeddingBatch).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, processed: 3, embedded: 2, failed: 1 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 when the batch throws", async () => {
    vi.mocked(runEmbeddingBatch).mockRejectedValueOnce(new Error("GEMINI_API_KEY non impostata"));
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/GEMINI_API_KEY/);
  });

  it("GET handler works the same as POST", async () => {
    vi.mocked(runEmbeddingBatch).mockResolvedValueOnce({ processed: 0, embedded: 0, failed: 0 });
    const req = new Request("http://localhost/api/cron/embed-documents", {
      headers: { authorization: "Bearer s3cret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(runEmbeddingBatch).toHaveBeenCalledTimes(1);
  });
});
