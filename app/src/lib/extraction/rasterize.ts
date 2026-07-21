// app/src/lib/extraction/rasterize.ts
// Step 2 of extraction (spec §4), the scanned-PDF fallback: render each page to a PNG so it can be
// OCR'd. unpdf drives pdf.js; in Node pdf.js renders through @napi-rs/canvas (native prebuilt,
// passed via canvasImport). Each PNG must stay under OCR.space's 1 MB free-tier cap, so we re-encode
// oversized pages smaller with sharp. maxPages bounds cost/time on huge documents.
import { getDocumentProxy, renderPageAsImage } from "unpdf";
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

  const pdf = await getDocumentProxy(pdfBytes);
  const pageCount = Math.min(pdf.numPages, maxPages);

  const images: Uint8Array[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const rendered = await renderPageAsImage(pdf, page, {
      canvasImport: () => import("@napi-rs/canvas"),
      width: targetWidth,
    });
    images.push(await capImageSize(new Uint8Array(rendered)));
  }
  return images;
}

// Guarantees a PNG under MAX_IMAGE_BYTES by shrinking width until it fits (or bottoms out). A page
// still over the cap after this is handed to OcrSpaceProvider, which rejects it (too_large) — that
// single page is then skipped as a partial failure rather than sinking the whole document.
async function capImageSize(png: Uint8Array): Promise<Uint8Array> {
  if (png.byteLength <= MAX_IMAGE_BYTES) return png;
  let width = 1400;
  let out = png;
  for (let attempt = 0; attempt < 4; attempt++) {
    out = new Uint8Array(await sharp(png).resize({ width }).png({ compressionLevel: 9 }).toBuffer());
    if (out.byteLength <= MAX_IMAGE_BYTES) return out;
    width = Math.round(width * 0.8);
  }
  return out;
}
