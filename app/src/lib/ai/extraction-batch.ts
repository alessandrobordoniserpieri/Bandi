// app/src/lib/ai/extraction-batch.ts
// Orchestrates the extraction worker with all I/O injected (spec §3), same idiom as
// app/src/lib/alerts/run-batch.ts. Claims one grant_documents row at a time and processes it
// until the time budget runs out or there is nothing left pending — never starts a document
// unless the worst case still fits, so a call can't straddle Vercel's maxDuration.
export interface PendingDocument {
  id: string;
  attachmentUrl: string;
}

export interface ExtractionBatchDeps {
  claimNextPending(): Promise<PendingDocument | null>;
  markReady(id: string, text: string, ocrUsed: boolean): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  extract(url: string): Promise<{ text: string; ocrUsed: boolean }>;
  hasTimeFor(worstCaseMs: number): boolean;
}

export interface ExtractionBatchResult {
  processed: number;
  ready: number;
  failed: number;
}

// Conservative single-document worst case: download + unpdf + OCR.space round trip.
export const EXTRACTION_WORST_CASE_MS = 60_000;

export async function runExtractionBatch(deps: ExtractionBatchDeps): Promise<ExtractionBatchResult> {
  const result: ExtractionBatchResult = { processed: 0, ready: 0, failed: 0 };

  while (deps.hasTimeFor(EXTRACTION_WORST_CASE_MS)) {
    const doc = await deps.claimNextPending();
    if (!doc) break;

    try {
      const { text, ocrUsed } = await deps.extract(doc.attachmentUrl);
      await deps.markReady(doc.id, text, ocrUsed);
      result.ready += 1;
    } catch (err) {
      await deps.markFailed(doc.id, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
    result.processed += 1;
  }

  return result;
}
