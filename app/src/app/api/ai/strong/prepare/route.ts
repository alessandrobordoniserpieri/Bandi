import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrant } from "@/lib/grants/queries";
import { filterPdfAttachments } from "@/lib/grants/pdf-attachments";
import { checkEntitlement } from "@/lib/ai/entitlement";
import { deriveReadiness } from "@/lib/ai/document-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opt-in trigger for the strong analysis (spec §1/§2): the first authenticated user to request it
// creates the pending grant_documents rows (shared, everyone else is free); the daily "extraction"
// entitlement bucket only counts NEW rows, never a re-check of an already-tracked grant.
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let grantId: unknown;
  try {
    ({ grantId } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof grantId !== "string" || !grantId) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const pdfs = filterPdfAttachments(view.grant.attachments ?? []);
  if (pdfs.length === 0) return Response.json({ readiness: "no_documents" });

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from("grant_documents")
    .select("attachment_url, status")
    .eq("grant_id", grantId);
  const existingUrls = new Set((existingRows ?? []).map((r) => r.attachment_url));
  const missing = pdfs.filter((p) => !existingUrls.has(p.url));

  if (missing.length > 0) {
    const { allowed } = await checkEntitlement(supabase, user.id, "extraction");
    if (!allowed) {
      return Response.json(
        { error: "Hai raggiunto il limite giornaliero di nuove estrazioni. Riprova domani." },
        { status: 429 },
      );
    }
    const { error } = await admin.from("grant_documents").upsert(
      missing.map((p) => ({ grant_id: grantId, attachment_url: p.url, status: "pending" })),
      { onConflict: "grant_id,attachment_url", ignoreDuplicates: true },
    );
    if (error) {
      return Response.json({ error: "Impossibile avviare l'estrazione. Riprova." }, { status: 502 });
    }
  }

  const rows = [...(existingRows ?? []), ...missing.map(() => ({ status: "pending" }))];
  return Response.json({ readiness: deriveReadiness(pdfs.length, rows) });
}
