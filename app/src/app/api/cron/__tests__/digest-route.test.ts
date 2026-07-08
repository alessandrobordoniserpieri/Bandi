import { describe, it, expect } from "vitest";
import { POST } from "../digest/route";

// The admin client and sender are only reached after auth; a missing secret must 401 first.
function post(auth?: string): Request {
  return new Request("http://localhost/api/cron/digest", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/digest", () => {
  it("rejects a request with no secret (401)", async () => {
    delete process.env.CRON_SECRET;
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret (401)", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(post("Bearer nope"));
    expect(res.status).toBe(401);
  });
});
