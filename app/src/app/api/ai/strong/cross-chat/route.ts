import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getProvider } from "@/lib/ai/provider";
import { getEmbeddingProvider } from "@/lib/ai/embedding-provider";
import { runCrossChatTurn, type RetrievedChunk } from "@/lib/ai/cross-chat";
import type { ChatTurn } from "@/lib/ai/chat";
import { checkEntitlement } from "@/lib/ai/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETRIEVE_K = 8;

// One turn of the cross-bando assistant (spec V2-A). Working-set = the user's saved grants. Embeds
// the question, retrieves the top-k relevant chunks across that set via pgvector, grounds the LLM
// on them. The user's message is persisted before the LLM call so it's never lost on failure.
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let message: unknown;
  try {
    ({ message } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  // Working-set: the user's saved grants. Nothing saved → nothing to search over.
  const { data: savedRows } = await supabase.from("saved_grants").select("grant_id").eq("user_id", user.id);
  const grantIds = (savedRows ?? []).map((r) => r.grant_id);
  if (grantIds.length === 0) {
    return Response.json({
      reply: "Non hai ancora bandi salvati. Salva qualche bando dalla lista e potrò confrontarli e rispondere a domande su di essi.",
      sources: [],
    });
  }

  const { allowed } = await checkEntitlement(supabase, user.id, "chat_message");
  if (!allowed) {
    return Response.json(
      { error: "Hai esaurito i crediti chat disponibili questo mese. Si ricaricano il mese prossimo." },
      { status: 429 },
    );
  }

  const { data: historyRows } = await supabase
    .from("cross_chat_messages").select("role, content").eq("user_id", user.id).order("created_at");
  const history: ChatTurn[] = (historyRows ?? []) as ChatTurn[];

  const row = profile as ProfileRow;
  const profileInput = {
    profile: rowToEntityProfile(row),
    name: row.name,
    activityDescription: row.activity_description,
  };

  await supabase.from("cross_chat_messages").insert({ user_id: user.id, role: "user", content: message });

  try {
    const [queryVec] = await getEmbeddingProvider().embed([message]);
    const { data: matches, error: rpcError } = await supabase.rpc("match_grant_chunks", {
      query_embedding: JSON.stringify(queryVec),
      grant_ids: grantIds,
      match_count: RETRIEVE_K,
    });
    if (rpcError) throw new Error(`match_grant_chunks: ${rpcError.message}`);

    const retrieved = matches ?? [];
    const uniqueGrantIds = [...new Set(retrieved.map((m) => m.grant_id))];
    const { data: titleRows } = uniqueGrantIds.length
      ? await supabase.from("grants").select("id, title").in("id", uniqueGrantIds)
      : { data: [] as { id: string; title: string }[] };
    const titleById = new Map((titleRows ?? []).map((g) => [g.id, g.title]));

    const chunks: RetrievedChunk[] = retrieved.map((m) => ({
      grantId: m.grant_id,
      grantTitle: titleById.get(m.grant_id) ?? m.grant_id,
      chunkText: m.chunk_text,
    }));

    const reply = await runCrossChatTurn(getProvider(process.env), profileInput, chunks, history, message);
    await supabase.from("cross_chat_messages").insert({ user_id: user.id, role: "assistant", content: reply });

    // De-duplicated grant sources for a "based on these bandi" UI affordance.
    const sources = [...new Map(chunks.map((c) => [c.grantId, { grantId: c.grantId, grantTitle: c.grantTitle }])).values()];
    return Response.json({ reply, sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/strong/cross-chat] failed:", msg);
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

// Cross-chat history for display on reload (per-user, owner RLS).
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  void request;
  const { data: rows } = await supabase
    .from("cross_chat_messages").select("role, content").eq("user_id", user.id).order("created_at");
  return Response.json({ messages: rows ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
