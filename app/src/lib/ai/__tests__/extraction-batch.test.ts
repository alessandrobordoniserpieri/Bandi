import { describe, it, expect, vi } from "vitest";
import { runExtractionBatch, EXTRACTION_WORST_CASE_MS, type ExtractionBatchDeps, type PendingDocument } from "../extraction-batch";

function fakeDeps(overrides: Partial<ExtractionBatchDeps> = {}): ExtractionBatchDeps {
  return {
    claimNextPending: vi.fn(async () => null),
    markReady: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    extract: vi.fn(async () => ({ text: "estratto", ocrUsed: false })),
    hasTimeFor: vi.fn(() => true),
    ...overrides,
  };
}

describe("runExtractionBatch", () => {
  it("returns zero counts and does nothing when there is no pending document", async () => {
    const deps = fakeDeps();
    const result = await runExtractionBatch(deps);
    expect(result).toEqual({ processed: 0, ready: 0, failed: 0 });
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("processes one document end-to-end and marks it ready", async () => {
    const doc: PendingDocument = { id: "doc-1", attachmentUrl: "https://example.org/a.pdf" };
    let claimed = false;
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => {
        if (claimed) return null;
        claimed = true;
        return doc;
      }),
      extract: vi.fn(async (url: string) => {
        expect(url).toBe(doc.attachmentUrl);
        return { text: "Testo estratto", ocrUsed: true };
      }),
    });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 1, ready: 1, failed: 0 });
    expect(deps.markReady).toHaveBeenCalledWith("doc-1", "Testo estratto", true);
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("marks a document failed (not a thrown error) when extraction throws", async () => {
    const doc: PendingDocument = { id: "doc-2", attachmentUrl: "https://example.org/b.pdf" };
    let claimed = false;
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => {
        if (claimed) return null;
        claimed = true;
        return doc;
      }),
      extract: vi.fn(async () => {
        throw new Error("PDF corrotto");
      }),
    });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 1, ready: 0, failed: 1 });
    expect(deps.markFailed).toHaveBeenCalledWith("doc-2", "PDF corrotto");
    expect(deps.markReady).not.toHaveBeenCalled();
  });

  it("loops until claimNextPending returns null, processing each document", async () => {
    const docs: PendingDocument[] = [
      { id: "d1", attachmentUrl: "https://x/1.pdf" },
      { id: "d2", attachmentUrl: "https://x/2.pdf" },
      { id: "d3", attachmentUrl: "https://x/3.pdf" },
    ];
    const deps = fakeDeps({ claimNextPending: vi.fn(async () => docs.shift() ?? null) });

    const result = await runExtractionBatch(deps);

    expect(result).toEqual({ processed: 3, ready: 3, failed: 0 });
    expect(deps.extract).toHaveBeenCalledTimes(3);
  });

  it("stops claiming more work once the time budget is exhausted", async () => {
    const doc: PendingDocument = { id: "d1", attachmentUrl: "https://x/1.pdf" };
    const hasTimeFor = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const deps = fakeDeps({
      claimNextPending: vi.fn(async () => doc),
      hasTimeFor,
    });

    const result = await runExtractionBatch(deps);

    expect(result.processed).toBe(1); // only the first hasTimeFor(true) let it claim work
    expect(deps.claimNextPending).toHaveBeenCalledTimes(1);
  });

  it("checks the budget with EXTRACTION_WORST_CASE_MS", async () => {
    const deps = fakeDeps();
    await runExtractionBatch(deps);
    expect(deps.hasTimeFor).toHaveBeenCalledWith(EXTRACTION_WORST_CASE_MS);
  });
});
