import { describe, it, expect } from "vitest";
import { deriveReadiness } from "../document-readiness";

describe("deriveReadiness", () => {
  it("is no_documents when the grant has zero PDF attachments", () => {
    expect(deriveReadiness(0, [])).toBe("no_documents");
  });

  it("is not_started when there are PDFs but extraction was never requested", () => {
    expect(deriveReadiness(2, [])).toBe("not_started");
  });

  it("is preparing while any row is pending or processing", () => {
    expect(deriveReadiness(2, [{ status: "pending" }, { status: "ready" }])).toBe("preparing");
    expect(deriveReadiness(2, [{ status: "processing" }, { status: "ready" }])).toBe("preparing");
  });

  it("is ready when every row is ready", () => {
    expect(deriveReadiness(2, [{ status: "ready" }, { status: "ready" }])).toBe("ready");
  });

  it("is ready_partial when some rows are ready and the rest failed", () => {
    expect(deriveReadiness(2, [{ status: "ready" }, { status: "failed" }])).toBe("ready_partial");
  });

  it("is failed_total when every row failed", () => {
    expect(deriveReadiness(2, [{ status: "failed" }, { status: "failed" }])).toBe("failed_total");
  });
});
