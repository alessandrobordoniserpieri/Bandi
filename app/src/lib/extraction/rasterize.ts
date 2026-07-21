// app/src/lib/extraction/rasterize.ts
// Step 2 of extraction (spec §4), the scanned-PDF fallback: render each page to a PNG so it can be
// OCR'd. unpdf drives pdf.js; in Node pdf.js renders through @napi-rs/canvas (native prebuilt,
// passed via canvasImport). Each PNG must stay under OCR.space's 1 MB free-tier cap, so we re-encode
// oversized pages smaller with sharp. maxPages bounds cost/time on huge documents.
import { getDocumentProxy, renderPageAsImage, createIsomorphicCanvasFactory } from "unpdf";
import sharp from "sharp";

const DEFAULT_TARGET_WIDTH = 1654; // ~200 DPI across an A4 width — enough for OCR, modest size.
const DEFAULT_MAX_PAGES = 25;
const MAX_IMAGE_BYTES = 1024 * 1024;

export async function rasterizePdf(
  pdfBytes: Uint8Array,
  opts: { maxPages?: number; targetWidth?: number } = {},
): Promise<Uint8Array[]> {
  const targetWidth = opts.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  // CanvasFactory must be wired in at document creation, not left to renderPageAsImage to add
  // later: renderPageAsImage only creates a (CanvasFactory-wired) document itself when given raw
  // bytes. Passed an already-created PDFDocumentProxy — as we do here — it reuses it as-is, so a
  // document created without a CanvasFactory never gets one. pdf.js's internal image-XObject
  // rendering path (used by any embedded raster image, e.g. a scanned page) then falls back to a
  // hardcoded canvas stub and throws "@napi-rs/canvas is not available in this environment".
  const canvasImport = () => import("@napi-rs/canvas");
  const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
  const pdf = await getDocumentProxy(pdfBytes, { CanvasFactory });
  const pageCount = Math.min(pdf.numPages, maxPages);

  const images: Uint8Array[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const rendered = await renderPageAsImage(pdf, page, { canvasImport, width: targetWidth });
    images.push(await capImageSize(new Uint8Array(rendered)));
  }
  return images;
}

// Guarantees a PNG under MAX_IMAGE_BYTES by shrinking width until it fits (or bottoms out). A page
// still over the cap after this is handed to OcrSpaceProvider, which rejects it (too_large) — that
// single page is then skipped as a partial failure rather than sinking the whole document.
async function capImageSize(png: Uint8Array): Promise<Uint8Array> {
  if (png.byteLength <= MAX_IMAGE_BYTES) return png;
  const meta = await sharp(png).metadata();
  let width = Math.min(meta.width ?? 1400, 1400);
  let out = png;
  for (let attempt = 0; attempt < 4; attempt++) {
    out = new Uint8Array(await sharp(png).resize({ width }).png({ compressionLevel: 9 }).toBuffer());
    if (out.byteLength <= MAX_IMAGE_BYTES) return out;
    width = Math.round(width * 0.8);
  }
  return out;
}
