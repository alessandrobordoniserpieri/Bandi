import { createClient } from "@/lib/supabase/server";
import { getGrant } from "@/lib/grants/queries";
import { filterPdfAttachments } from "@/lib/grants/pdf-attachments";
import { deriveReadiness } from "@/lib/ai/document-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only polling endpoint (spec §6): the UI polls this every ~8-10s while readiness is
// "preparing", then swaps in the analysis + chat once it flips to "ready"/"ready_partial".
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const grantId = new URL(request.url).searchParams.get("grantId");
  if (!grantId) return Response.json({ error: "Richiesta non valida." }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const pdfCount = filterPdfAttachments(view.grant.attachments ?? []).length;
  const { data: rows } = await supabase
    .from("grant_documents").select("status").eq("grant_id", grantId);

  return Response.json({ readiness: deriveReadiness(pdfCount, rows ?? []) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
