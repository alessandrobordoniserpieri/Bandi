import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { rasterizePdf } from "../rasterize";

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]);
  return doc.save();
}

// Deterministic PRNG (mulberry32) for the dense-glyph fixture below. Math.random() would make the
// fixture non-deterministic: a lucky draw could produce a pre-shrink PNG already under 1 MB, which
// would silently skip capImageSize's shrink branch while the test's only assertion ("final PNG <=
// 1 MB") still passes. A fixed seed makes the fixture — and therefore which code path the test
// exercises — reproducible across runs and machines.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a single page densely packed with small pseudo-random-colored monospace glyphs, so its
// rendered PNG genuinely exceeds MAX_IMAGE_BYTES (1 MB) and exercises capImageSize's shrink loop for
// real — the blank pages above rasterize to trivial PNGs that never get near the cap.
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
// as real scanned/photographic content.
//
// capImageSize is intentionally private to rasterize.ts, so this test can't assert on the pre-shrink
// size directly. Instead the fixture is deliberately over-sized with a large safety margin: measured
// directly (rendering the fixture below through the same unpdf pipeline, bypassing capImageSize) at
// a fixed seed, the pre-shrink PNG is ~2.2 MB — more than double the 1 MB cap — and shrinks to ~710
// KB after the loop's 4 attempts. Because both the fixture and the render pipeline are deterministic,
// that ~2.2x margin holds on every run, making it practically impossible for this fixture to
// accidentally land under the cap and skip the shrink branch.
async function noisyTextPdf(): Promise<Uint8Array> {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&*";
  const pageWidth = 1654; // matches rasterize.ts's DEFAULT_TARGET_WIDTH so render scale is ~1:1
  const pageHeight = 850;
  const spacing = 6;
  const fontSize = 6;
  const rand = mulberry32(0xc0ffee); // fixed seed: reproducible fixture, see comment above

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([pageWidth, pageHeight]);
  for (let y = 0; y < pageHeight; y += spacing) {
    for (let x = 0; x < pageWidth; x += spacing) {
      page.drawText(CHARS[Math.floor(rand() * CHARS.length)], {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(rand(), rand(), rand()),
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

  // Regression test for a CanvasFactory wiring bug: rasterizePdf used to call getDocumentProxy(pdfBytes)
  // without a CanvasFactory, then hand that already-created PDFDocumentProxy to renderPageAsImage.
  // Because renderPageAsImage only wires a CanvasFactory into the document when IT creates the
  // document from raw bytes (isPDFDocumentProxy(data) short-circuits that when given a proxy), the
  // document itself was never given a working canvas. pdf.js's internal image-XObject rendering path
  // (paintImageXObject) — hit by ANY embedded raster image, which is exactly what a real scanned PDF
  // page is — then fell back to a hardcoded stub and threw "@napi-rs/canvas is not available in this
  // environment". The noisyTextPdf fixture above avoids embedded images for that historical reason
  // (see its comment); this test exercises the previously-broken path directly.
  it("rasterizes a page with an embedded raster image without throwing, and renders it correctly", async () => {
    const pageWidth = 400;
    const pageHeight = 300;
    const squareSize = 100;
    const squareX = 150;
    const squareY = 100;

    const squarePng = await sharp({
      create: { width: squareSize, height: squareSize, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const doc = await PDFDocument.create();
    const page = doc.addPage([pageWidth, pageHeight]);
    const embeddedImage = await doc.embedPng(squarePng);
    page.drawImage(embeddedImage, { x: squareX, y: squareY, width: squareSize, height: squareSize });
    const pdfBytes = await doc.save();

    // targetWidth == pageWidth keeps the render scale at ~1:1, so PDF-space coordinates map
    // directly onto output pixel coordinates (modulo the y-axis flip handled by pixelAt below).
    const images = await rasterizePdf(pdfBytes, { targetWidth: pageWidth });
    expect(images).toHaveLength(1);
    const [img] = images;
    expect([...img.subarray(0, 4)]).toEqual(PNG_MAGIC);

    const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
    const scaleX = info.width / pageWidth;
    const scaleY = info.height / pageHeight;
    const pixelAt = (pdfX: number, pdfY: number) => {
      const px = Math.min(info.width - 1, Math.max(0, Math.round(pdfX * scaleX)));
      // PDF coordinates originate bottom-left; the rendered raster originates top-left.
      const py = Math.min(info.height - 1, Math.max(0, Math.round((pageHeight - pdfY) * scaleY)));
      const idx = (py * info.width + px) * info.channels;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    };

    // Inside the drawn square: dominant red channel, low green/blue (tolerant of anti-aliasing and
    // color-space conversion — a real fix should still land well within these margins).
    const inside = pixelAt(squareX + squareSize / 2, squareY + squareSize / 2);
    expect(inside.r).toBeGreaterThan(200);
    expect(inside.g).toBeLessThan(50);
    expect(inside.b).toBeLessThan(50);

    // Clearly outside the square: untouched white page background.
    const outside = pixelAt(20, 20);
    expect(outside.r).toBeGreaterThan(200);
    expect(outside.g).toBeGreaterThan(200);
    expect(outside.b).toBeGreaterThan(200);
  });
});
