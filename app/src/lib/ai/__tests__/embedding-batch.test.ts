import { describe, it, expect, vi } from "vitest";
import { runEmbeddingBatch, EMBEDDING_WORST_CASE_MS, type EmbeddingBatchDeps, type ClaimedDocument } from "../embedding-batch";

function fakeDeps(overrides: Partial<EmbeddingBatchDeps> = {}): EmbeddingBatchDeps {
  return {
    claimNext: vi.fn(async () => null),
    chunk: (text: string) => [text],
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2])),
    saveChunks: vi.fn(async () => {}),
    markChunked: vi.fn(async () => {}),
    markEmbedFailed: vi.fn(async () => {}),
    hasTimeFor: vi.fn(() => true),
    ...overrides,
  };
}

const doc: ClaimedDocument = { id: "d1", grantId: "g1", extractedText: "testo del bando abbastanza lungo" };

describe("runEmbeddingBatch", () => {
  it("does nothing and returns zero counts when nothing is claimable", async () => {
    const deps = fakeDeps();
    const result = await runEmbeddingBatch(deps);
    expect(result).toEqual({ processed: 0, embedded: 0, failed: 0 });
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it("chunks, embeds, saves, and marks a document chunked", async () => {
    let claimed = false;
    const chunk = vi.fn(() => ["chunk A", "chunk B"]);
    const embed = vi.fn(async () => [[1, 1], [2, 2]]);
    const deps = fakeDeps({
      claimNext: vi.fn(async () => (claimed ? null : ((claimed = true), doc))),
      chunk,
      embed,
    });

    const result = await runEmbeddingBatch(deps);

    expect(result).toEqual({ processed: 1, embedded: 1, failed: 0 });
    expect(chunk).toHaveBeenCalledWith(doc.extractedText);
    expect(embed).toHaveBeenCalledWith(["chunk A", "chunk B"]);
    expect(deps.saveChunks).toHaveBeenCalledWith("g1", "d1", [
      { index: 0, text: "chunk A", embedding: [1, 1] },
      { index: 1, text: "chunk B", embedding: [2, 2] },
    ]);
    expect(deps.markChunked).toHaveBeenCalledWith("d1");
    expect(deps.markEmbedFailed).not.toHaveBeenCalled();
  });

  it("marks a document chunked (not failed) when it has no usable text chunks", async () => {
    let claimed = false;
    const deps = fakeDeps({
      claimNext: vi.fn(async () => (claimed ? null : ((claimed = true), { ...doc, extractedText: "   " }))),
      chunk: () => [],
      embed: vi.fn(),
    });

    const result = await runEmbeddingBatch(deps);

    expect(result).toEqual({ processed: 1, embedded: 1, failed: 0 });
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.markChunked).toHaveBeenCalledWith("d1");
  });

  it("marks a document embed-failed when embedding throws", async () => {
    let claimed = false;
    const deps = fakeDeps({
      claimNext: vi.fn(async () => (claimed ? null : ((claimed = true), doc))),
      chunk: () => ["a"],
      embed: vi.fn(async () => { throw new Error("gemini down"); }),
    });

    const result = await runEmbeddingBatch(deps);

    expect(result).toEqual({ processed: 1, embedded: 0, failed: 1 });
    expect(deps.markEmbedFailed).toHaveBeenCalledWith("d1", "gemini down");
    expect(deps.markChunked).not.toHaveBeenCalled();
  });

  it("stops claiming once the time budget is exhausted", async () => {
    const hasTimeFor = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const deps = fakeDeps({ claimNext: vi.fn(async () => doc), hasTimeFor });
    const result = await runEmbeddingBatch(deps);
    expect(result.processed).toBe(1);
    expect(deps.claimNext).toHaveBeenCalledTimes(1);
    expect(deps.hasTimeFor).toHaveBeenCalledWith(EMBEDDING_WORST_CASE_MS);
  });
});
