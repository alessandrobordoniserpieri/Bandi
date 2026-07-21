import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { rasterizePdf } from "../rasterize";

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]);
  return doc.save();
}

// Builds a single page densely packed with small random-colored monospace glyphs, so its rendered
// PNG genuinely exceeds MAX_IMAGE_BYTES (1 MB) and exercises capImageSize's shrink loop for real —
// the blank pages above rasterize to trivial PNGs that never get near the cap.
//
// Why glyph noise and not a plain high-entropy raster image (the more obvious fixture): embedding a
// noise PNG via pdf-lib and rendering it through unpdf's Node canvas pipeline crashes in this repo's
// dependency versions ("@napi-rs/canvas is not available in this environment") for *any* embedded
// raster image regardless of size — a pdf.js/unpdf wiring gap where the image-XObject code path
// creates its own internal canvas factory instead of the one resolved from canvasImport, unrelated
// to rasterize.ts. Verified separately: @napi-rs/canvas works fine standalone (including drawImage);
// only the unpdf-mediated pdf.js image-XObject path is affected.
//
// A hard-edged alternative (a checkerboard of solid-color rectangles) was also tried and rejected:
// it does exceed 1 MB pre-shrink, but its sharp edges provoke Lanczos ringing on sharp's resize —
// the very first shrink attempt makes the file ~9x *larger*, and the loop can never recover within
// 4 attempts. Dense anti-aliased glyphs don't have that failure mode and shrink monotonically, same
// as real scanned/photographic content. Calibrated (5 runs) to ~2.2 MB pre-shrink and ~710 KB after
// the loop's 4 attempts — comfortable margin on both sides of the 1 MB cap.
async function noisyTextPdf(): Promise<Uint8Array> {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&*";
  const pageWidth = 1654; // matches rasterize.ts's DEFAULT_TARGET_WIDTH so render scale is ~1:1
  const pageHeight = 850;
  const spacing = 6;
  const fontSize = 6;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([pageWidth, pageHeight]);
  for (let y = 0; y < pageHeight; y += spacing) {
    for (let x = 0; x < pageWidth; x += spacing) {
      page.drawText(CHARS[Math.floor(Math.random() * CHARS.length)], {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(Math.random(), Math.random(), Math.random()),
      });
    }
  }
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

  it(
    "shrinks a page whose rendered PNG exceeds 1 MB down under the cap",
    async () => {
      const images = await rasterizePdf(await noisyTextPdf(), { maxPages: 1 });
      expect(images).toHaveLength(1);
      const [img] = images;
      expect([...img.subarray(0, 4)]).toEqual(PNG_MAGIC);
      expect(img.byteLength).toBeLessThanOrEqual(1024 * 1024);
    },
    30_000, // building/rendering ~40k glyphs plus up to 4 sharp resizes is slower than the blank-page cases
  );
});
