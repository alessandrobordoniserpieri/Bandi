// app/src/lib/grants/pdf-attachments.ts
// A grant's PDF-only attachments — the strong-analysis feature only ever reads PDFs. The scraper
// doesn't always capture a mimeType, so a .pdf URL extension is an accepted fallback signal.
import type { Attachment } from "@/lib/matching";

export function filterPdfAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter(
    (a) => a.mimeType === "application/pdf" || (!a.mimeType && a.url.toLowerCase().endsWith(".pdf")),
  );
}
