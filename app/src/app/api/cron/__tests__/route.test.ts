import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the scraper package so the route test never touches the network or a real DB.
vi.mock("bandi-scraper", () => ({ runProductionScrape: vi.fn(async () => []) }));

import { POST } from "../scrape/route";
import { runProductionScrape } from "bandi-scraper";

function post(auth?: string): Request {
  return new Request("http://localhost/api/cron/scrape", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/scrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret";
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(runProductionScrape).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret (401)", async () => {
    const res = await POST(post("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runProductionScrape).not.toHaveBeenCalled();
  });

  it("runs the pipeline and returns totals with the correct secret", async () => {
    vi.mocked(runProductionScrape).mockResolvedValueOnce([
      { sourceId: "s1", inserted: 2, updated: 1, skipped: 0, errors: [], detailErrors: [] },
    ]);
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(runProductionScrape).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totals).toEqual({ inserted: 2, updated: 1, skipped: 0, errors: 0 });
  });

  it("returns 500 when the pipeline throws", async () => {
    vi.mocked(runProductionScrape).mockRejectedValueOnce(new Error("browserless down"));
    const res = await POST(post("Bearer s3cret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/browserless down/);
  });
});
