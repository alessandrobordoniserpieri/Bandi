import { describe, it, expect } from "vitest";
import { filterPdfAttachments } from "../pdf-attachments";
import type { Attachment } from "@/lib/matching";

describe("filterPdfAttachments", () => {
  it("keeps attachments with mimeType application/pdf", () => {
    const atts: Attachment[] = [{ title: "Avviso", url: "https://x/a", mimeType: "application/pdf" }];
    expect(filterPdfAttachments(atts)).toEqual(atts);
  });

  it("keeps attachments with no mimeType but a .pdf URL (case-insensitive)", () => {
    const atts: Attachment[] = [{ title: "Avviso", url: "https://x/a.PDF", mimeType: null }];
    expect(filterPdfAttachments(atts)).toEqual(atts);
  });

  it("drops attachments that are neither application/pdf nor a .pdf URL", () => {
    const atts: Attachment[] = [
      { title: "Logo", url: "https://x/logo.png", mimeType: "image/png" },
      { title: "Pagina", url: "https://x/pagina", mimeType: null },
    ];
    expect(filterPdfAttachments(atts)).toEqual([]);
  });

  it("returns [] for an empty list", () => {
    expect(filterPdfAttachments([])).toEqual([]);
  });
});
