import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/ai/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only balance for the UI badge (spec V2-B). RLS grants the user's own client SELECT on
// user_credits (migration 0017), so no admin client is needed here — only writes require it.
export async function GET(_request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const balance = await getCreditBalance(supabase, user.id);
  return Response.json(balance, { headers: { "Cache-Control": "no-store" } });
}
