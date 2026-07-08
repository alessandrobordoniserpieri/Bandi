import type { SupabaseClient } from "@supabase/supabase-js";
import { BrowserlessFetcher } from "bandi-scraper";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/ai/provider";
import {
  confirmSubmittedGrant, previewSubmittedUrl, type SubmitUrlDb,
} from "@/lib/grants/submit-url";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Browserless fetch + one LLM extraction

// grants is select-only under RLS; crowdsourced inserts go through the service-role client,
// but only after the payload passed submittedGrantSchema (vocab-safe) and the user is authed.
function makeDb(admin: SupabaseClient<Database>): SubmitUrlDb {
  return {
    async findGrantByUrl(url) {
      const { data } = await admin.from("grants").select("id, title").eq("url", url).maybeSingle();
      return data ?? null;
    },
    async findProviderIdByName(name) {
      const { data } = await admin.from("grant_providers").select("id").eq("name", name).maybeSingle();
      return data?.id ?? null;
    },
    async insertGrant(row) {
      const { data, error } = await admin.from("grants")
        .insert(row as never).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      return { id: data.id };
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let body: { action?: unknown; url?: unknown; grant?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const db = makeDb(createAdminClient());

  try {
    if (body.action === "preview") {
      if (typeof body.url !== "string" || !body.url) {
        return Response.json({ error: "Inserisci un URL valido." }, { status: 400 });
      }
      const apiKey = process.env.BROWSERLESS_API_KEY;
      if (!apiKey) {
        return Response.json({ error: "Servizio non configurato." }, { status: 503 });
      }
      const fetcher = new BrowserlessFetcher({ apiKey, baseUrl: process.env.BROWSERLESS_URL });
      const result = await previewSubmittedUrl(body.url, {
        fetchHtml: async (url) => {
          const pages = await fetcher.fetchPages({ id: "user-submit", name: "user-submit", url });
          return pages[0]?.html ?? "";
        },
        llm: getProvider(process.env),
        db,
      });
      return Response.json(result);
    }

    if (body.action === "confirm") {
      const result = await confirmSubmittedGrant(body.grant, db);
      if (result.status === "invalid") {
        return Response.json({ error: "Dati del bando non validi." }, { status: 422 });
      }
      return Response.json(result);
    }

    return Response.json({ error: "Azione sconosciuta." }, { status: 400 });
  } catch (err) {
    console.error("[grants/submit-url] failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "Impossibile analizzare la pagina. Controlla l'URL e riprova." },
      { status: 502 },
    );
  }
}
