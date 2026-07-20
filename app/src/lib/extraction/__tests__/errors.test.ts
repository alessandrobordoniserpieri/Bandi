import { describe, it, expect } from "vitest";
import { ExtractionError } from "../types";

describe("ExtractionError", () => {
  it("carries a typed code and a retryable flag, defaulting retryable to false", () => {
    const e = new ExtractionError("download_failed", "boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("download_failed");
    expect(e.retryable).toBe(false);
    expect(e.name).toBe("ExtractionError");
  });

  it("preserves an explicit retryable flag and message", () => {
    const e = new ExtractionError("ocr_failed", "ocrspace: HTTP 500", { retryable: true });
    expect(e.retryable).toBe(true);
    expect(e.message).toBe("ocrspace: HTTP 500");
  });
});
