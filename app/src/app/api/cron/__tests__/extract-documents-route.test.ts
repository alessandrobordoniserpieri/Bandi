import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/ai/extraction-batch", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/ai/extraction-batch")>(
    "../../../../lib/ai/extraction-batch",
  );
  return { ...actual, runExtractionBatch: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("../../../../lib/ai/ocr-provider", () => ({ getOcrProvider: vi.fn(() => ({ ocr: vi.fn() })) }));

import { GET, POST } from "../extract-documents/route";
import { runExtractionBatch } from "@/lib/ai/extraction-batch";

function post(auth?: string): Request {
  return new Request("http://localhost/api/cron/extract-documents", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/extract-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret";
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(runExtractionBatch).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret (401)", async () => {
    const res = await POST(post("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runExtractionBatch).not.toHaveBeenCalled();
  });

  it("runs the batch and returns its counts with the correct secret", async () => {
    vi.mocked(runExtractionBatch).mockResolvedValueOnce({ processed: 2, ready: 1, failed: 1 });
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(runExtractionBatch).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.ready).toBe(1);
    expect(body.failed).toBe(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 when the batch throws", async () => {
    vi.mocked(runExtractionBatch).mockRejectedValueOnce(new Error("OCR_SPACE_API_KEY non impostata"));
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/OCR_SPACE_API_KEY/);
  });

  it("GET handler works the same as POST", async () => {
    vi.mocked(runExtractionBatch).mockResolvedValueOnce({ processed: 0, ready: 0, failed: 0 });
    const req = new Request("http://localhost/api/cron/extract-documents", {
      headers: { authorization: "Bearer s3cret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(runExtractionBatch).toHaveBeenCalledTimes(1);
  });
});
