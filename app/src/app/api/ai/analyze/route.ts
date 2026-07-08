import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import { analyzeGrant } from "@/lib/ai/analyze-grant";
import { consumeAnalysisQuota } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // roadmap: 60s cap for the on-demand analysis

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

  const { allowed } = await consumeAnalysisQuota(supabase, user.id);
  if (!allowed) {
    return Response.json(
      { error: "Hai raggiunto il limite orario di analisi. Riprova più tardi." },
      { status: 429 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const row = profile as ProfileRow;
  try {
    const analysis = await analyzeGrant(
      getProvider(process.env),
      {
        profile: rowToEntityProfile(row),
        name: row.name,
        activityDescription: row.activity_description,
      },
      view.grant,
      view.providerName,
    );
    return Response.json({ analysis });
  } catch (err) {
    console.error("[ai/analyze] failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "Analisi non riuscita. Riprova tra qualche istante." },
      { status: 502 },
    );
  }
}
