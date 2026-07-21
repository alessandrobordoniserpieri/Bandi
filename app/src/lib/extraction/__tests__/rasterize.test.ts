import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { rasterizePdf } from "../rasterize";

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]);
  return doc.save();
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // ‰PNG

describe("rasterizePdf", () => {
  it("renders one PNG per page, each a valid PNG under 1 MB", async () => {
    const images = await rasterizePdf(await blankPdf(2));
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img).toBeInstanceOf(Uint8Array);
      expect([...img.subarray(0, 4)]).toEqual(PNG_MAGIC);
      expect(img.byteLength).toBeLessThanOrEqual(1024 * 1024);
    }
  });

  it("caps the number of rendered pages at maxPages", async () => {
    const images = await rasterizePdf(await blankPdf(5), { maxPages: 3 });
    expect(images).toHaveLength(3);
  });
});
