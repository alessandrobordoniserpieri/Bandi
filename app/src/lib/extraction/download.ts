// app/src/lib/extraction/download.ts
// Fetches an attachment's bytes with defensive guards. Attachments are third-party URLs
// (grants.attachments), so anything can come back: 404 HTML, giant files, non-PDFs. Every bad
// outcome is a typed ExtractionError; transient ones (network/timeout/5xx/429) are retryable.
import { ExtractionError, type FetchImpl } from "./types";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB: generous for a bando PDF, blocks abuse.
const DEFAULT_TIMEOUT_MS = 30_000;

export async function downloadPdf(
  url: string,
  opts: { fetchImpl?: FetchImpl; maxBytes?: number; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    throw new ExtractionError("download_failed", "download: errore di rete o timeout", { retryable: true, cause });
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ExtractionError("download_failed", `download: HTTP ${res.status}`, { retryable: true });
  }
  if (!res.ok) {
    throw new ExtractionError("download_failed", `download: HTTP ${res.status}`, { retryable: false });
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new ExtractionError("too_large", `download: file oltre ${maxBytes} byte`, { retryable: false });
  }
  // PDF magic: "%PDF-" appears at (or very near) the start. Decode a small head window as latin1
  // so raw bytes map 1:1 to chars; tolerate a leading BOM/whitespace.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    throw new ExtractionError("not_pdf", "download: il contenuto non è un PDF", { retryable: false });
  }
  return bytes;
}
