import { describe, it, expect } from "vitest";
import { PdfExtractionError } from "../pdf-extraction-error";

describe("PdfExtractionError", () => {
  it("carries its kind and message, and chains a cause", () => {
    const cause = new Error("network down");
    const err = new PdfExtractionError("download", "impossibile scaricare il PDF", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe("download");
    expect(err.message).toBe("impossibile scaricare il PDF");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("PdfExtractionError");
  });
});
