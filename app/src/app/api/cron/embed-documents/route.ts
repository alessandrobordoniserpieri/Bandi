import { createBudget } from "bandi-scraper";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmbeddingProvider } from "@/lib/ai/embedding-provider";
import { chunkText } from "@/lib/ai/chunk-text";
import { runEmbeddingBatch } from "@/lib/ai/embedding-batch";
import { isAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMBEDDING_BUDGET_MS = 270_000;

// Triggered by the embedding pg_cron scheduler (migration 0016). CRON_SECRET-protected. Separate
// cron/route from the extraction one — off until its own Vault secrets are configured (spec V2-A).
export async function GET(request: Request): Promise<Response> {
  return handleEmbed(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleEmbed(request);
}

async function handleEmbed(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const embedder = getEmbeddingProvider();
  const budget = createBudget(EMBEDDING_BUDGET_MS);

  try {
    const result = await runEmbeddingBatch({
      hasTimeFor: (ms) => budget.hasTimeFor(ms),
      chunk: (text) => chunkText(text),
      embed: (texts) => embedder.embed(texts),
      async claimNext() {
        const { data, error } = await admin.rpc("claim_document_for_embedding");
        if (error) throw new Error(`claim_document_for_embedding: ${error.message}`);
        const row = data?.[0];
        return row ? { id: row.id, grantId: row.grant_id, extractedText: row.extracted_text } : null;
      },
      async saveChunks(grantId, documentId, chunks) {
        // Replace any prior chunks for this document (idempotent re-embed), then insert.
        await admin.from("grant_document_chunks").delete().eq("document_id", documentId);
        const { error } = await admin.from("grant_document_chunks").insert(
          chunks.map((c) => ({
            grant_id: grantId,
            document_id: documentId,
            chunk_index: c.index,
            chunk_text: c.text,
            // pgvector accepts the JSON-array literal "[0.1,0.2,...]" as its text input format.
            embedding: JSON.stringify(c.embedding),
          })),
        );
        if (error) throw new Error(`saveChunks: ${error.message}`);
      },
      async markChunked(documentId) {
        const { error } = await admin
          .from("grant_documents")
          .update({ chunked_at: new Date().toISOString() })
          .eq("id", documentId);
        if (error) throw new Error(`markChunked: ${error.message}`);
      },
      async markEmbedFailed(documentId, message) {
        // Leave embed_claimed_at set: the claim's 10-min stale recovery retries it on a LATER run.
        // Do NOT clear it here — that would let the same run re-claim it immediately and hot-loop.
        console.error("[cron/embed-documents] doc", documentId, "failed:", message);
      },
    });
    console.log("[cron/embed-documents]", JSON.stringify(result));
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/embed-documents] failed:", message);
    return Response.json({ ok: false, error: message }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
