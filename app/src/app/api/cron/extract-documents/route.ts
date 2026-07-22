import { createBudget } from "bandi-scraper";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOcrProvider } from "@/lib/ai/ocr-provider";
import { createPdfTextExtractor } from "@/lib/ai/pdf-text-extractor";
import { runExtractionBatch } from "@/lib/ai/extraction-batch";
import { isAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Downloading + OCR-ing several PDFs can exceed the default 60s; Hobby plan caps at 300s.
export const maxDuration = 300;

// Conservative soft deadline below Vercel's hard 300s kill, mirroring the scraper's budget.ts.
const EXTRACTION_BUDGET_MS = 270_000;

// Triggered by the extraction pg_cron scheduler (migration 0015). Protected by CRON_SECRET so
// only the scheduler (or an authorized manual call) can start a run. Separate cron/route from
// /api/cron/scrape — this one is off until its own Vault secrets are configured (spec §3).
export async function GET(request: Request): Promise<Response> {
  return handleExtract(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleExtract(request);
}

async function handleExtract(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const extractor = createPdfTextExtractor({ ocr: getOcrProvider() });
  const budget = createBudget(EXTRACTION_BUDGET_MS);

  try {
    const result = await runExtractionBatch({
      hasTimeFor: (worstCaseMs) => budget.hasTimeFor(worstCaseMs),
      extract: (url) => extractor.extract(url),
      async claimNextPending() {
        const { data, error } = await admin.rpc("claim_pending_document");
        if (error) throw new Error(`claim_pending_document: ${error.message}`);
        const row = data?.[0];
        return row ? { id: row.id, attachmentUrl: row.attachment_url } : null;
      },
      async markReady(id, text, ocrUsed) {
        const { error } = await admin
          .from("grant_documents")
          .update({ status: "ready", extracted_text: text, ocr_used: ocrUsed, error: null, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(`markReady: ${error.message}`);
      },
      async markFailed(id, message) {
        const { error } = await admin
          .from("grant_documents")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(`markFailed: ${error.message}`);
      },
    });
    console.log("[cron/extract-documents]", JSON.stringify(result));
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/extract-documents] failed:", message);
    return Response.json({ ok: false, error: message }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
