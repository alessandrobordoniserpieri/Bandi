import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import { runChatTurn, type ChatTurn } from "@/lib/ai/chat";
import type { DocumentText } from "@/lib/ai/analyze-grant";
import { checkEntitlement } from "@/lib/ai/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One turn of the per-grant advisory chat (spec §5). The user's message is persisted before the
// LLM call so it's never lost if the call fails; the assistant reply is persisted only on success.
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let grantId: unknown, message: unknown;
  try {
    ({ grantId, message } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof grantId !== "string" || !grantId || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const { allowed } = await checkEntitlement(supabase, user.id, "chat_message");
  if (!allowed) {
    return Response.json(
      { error: "Hai esaurito i crediti chat disponibili questo mese. Si ricaricano il mese prossimo." },
      { status: 429 },
    );
  }

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const [{ data: docRows }, { data: historyRows }] = await Promise.all([
    supabase.from("grant_documents").select("attachment_url, extracted_text").eq("grant_id", grantId).eq("status", "ready"),
    supabase.from("chat_messages").select("role, content").eq("grant_id", grantId).eq("user_id", user.id).order("created_at"),
  ]);

  const documents: DocumentText[] = (docRows ?? [])
    .filter((d): d is { attachment_url: string; extracted_text: string } => Boolean(d.extracted_text))
    .map((d) => ({
      title: view.grant.attachments?.find((a) => a.url === d.attachment_url)?.title ?? d.attachment_url,
      text: d.extracted_text,
    }));
  const history: ChatTurn[] = (historyRows ?? []) as ChatTurn[];

  await supabase.from("chat_messages").insert({ grant_id: grantId, user_id: user.id, role: "user", content: message });

  const row = profile as ProfileRow;
  try {
    const reply = await runChatTurn(
      getProvider(process.env),
      { profile: rowToEntityProfile(row), name: row.name, activityDescription: row.activity_description },
      view.grant,
      view.providerName,
      documents,
      history,
      message,
    );
    await supabase.from("chat_messages").insert({ grant_id: grantId, user_id: user.id, role: "assistant", content: reply });
    return Response.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/strong/chat] failed:", msg);
    const isRateLimit = msg.includes("429");
    return Response.json(
      {
        error: isRateLimit
          ? "Il provider AI ha raggiunto il limite di richieste. Riprova tra qualche minuto."
          : "Risposta non riuscita. Riprova tra qualche istante.",
      },
      { status: isRateLimit ? 429 : 502 },
    );
  }
}

// Chat history for display on reload (spec §5: "riprendibile tra sessioni/dispositivi"). No
// entitlement/LLM call — a plain owner-scoped read (RLS already restricts to the caller's rows).
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const grantId = new URL(request.url).searchParams.get("grantId");
  if (!grantId) return Response.json({ error: "Richiesta non valida." }, { status: 400 });

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("grant_id", grantId)
    .eq("user_id", user.id)
    .order("created_at");

  return Response.json({ messages: rows ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
