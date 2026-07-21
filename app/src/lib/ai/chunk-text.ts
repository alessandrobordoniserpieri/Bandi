// app/src/lib/ai/chunk-text.ts
// Char-based sliding-window chunker over already-extracted grant text (spec V2-A). Fixed-size
// windows with overlap keep neighboring context together for retrieval; whitespace-only chunks are
// dropped. Deliberately simple — retrieval quality here is dominated by embedding + top-k, not by
// clever boundary detection (which the scraper already does at ingest for a different purpose).
export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

const DEFAULT_SIZE = 2000;
const DEFAULT_OVERLAP = 200;

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const size = options.size ?? DEFAULT_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const step = Math.max(1, size - overlap);

  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + size);
    if (chunk.trim().length > 0) chunks.push(chunk);
    if (start + size >= text.length) break;
  }
  return chunks;
}
