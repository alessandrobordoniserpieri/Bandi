// app/src/lib/ai/embedding-batch.ts
// Orchestrates the embedding worker with all I/O injected (spec V2-A), same idiom as
// runExtractionBatch. Claims one ready+unchunked grant_documents row at a time, chunks its text,
// embeds the chunks, persists them, and marks the document chunked — until the budget runs out or
// nothing is claimable. A document with no usable text is marked chunked (done, nothing to embed),
// not failed; an embedding error marks it failed so it can be retried on a later run.
export interface ClaimedDocument {
  id: string;
  grantId: string;
  extractedText: string;
}

export interface ChunkToSave {
  index: number;
  text: string;
  embedding: number[];
}

export interface EmbeddingBatchDeps {
  claimNext(): Promise<ClaimedDocument | null>;
  chunk(text: string): string[];
  embed(texts: string[]): Promise<number[][]>;
  saveChunks(grantId: string, documentId: string, chunks: ChunkToSave[]): Promise<void>;
  markChunked(documentId: string): Promise<void>;
  markEmbedFailed(documentId: string, error: string): Promise<void>;
  hasTimeFor(worstCaseMs: number): boolean;
}

export interface EmbeddingBatchResult {
  processed: number;
  embedded: number;
  failed: number;
}

// Conservative single-document worst case: chunk + one batch embedding round trip + inserts.
export const EMBEDDING_WORST_CASE_MS = 40_000;

export async function runEmbeddingBatch(deps: EmbeddingBatchDeps): Promise<EmbeddingBatchResult> {
  const result: EmbeddingBatchResult = { processed: 0, embedded: 0, failed: 0 };

  while (deps.hasTimeFor(EMBEDDING_WORST_CASE_MS)) {
    const doc = await deps.claimNext();
    if (!doc) break;

    try {
      const chunks = deps.chunk(doc.extractedText);
      if (chunks.length > 0) {
        const vectors = await deps.embed(chunks);
        await deps.saveChunks(
          doc.grantId,
          doc.id,
          chunks.map((text, index) => ({ index, text, embedding: vectors[index]! })),
        );
      }
      await deps.markChunked(doc.id);
      result.embedded += 1;
    } catch (err) {
      await deps.markEmbedFailed(doc.id, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
    result.processed += 1;
  }

  return result;
}
