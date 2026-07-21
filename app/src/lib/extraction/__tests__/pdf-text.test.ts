import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractTextLayer } from "../pdf-text";

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  lines.forEach((line, i) => page.drawText(line, { x: 20, y: 160 - i * 20, size: 14, font }));
  return doc.save();
}

describe("extractTextLayer", () => {
  it("returns the text layer of a born-digital PDF", async () => {
    const bytes = await textPdf(["Bando ETS 2026", "Contributo terzo settore"]);
    const text = await extractTextLayer(bytes);
    expect(text).toContain("Bando ETS 2026");
    expect(text).toContain("Contributo terzo settore");
  });

  it("returns an empty string for a PDF with no text layer (scanned-like)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]); // page with no drawn text
    const text = await extractTextLayer(await doc.save());
    expect(text).toBe("");
  });
});
