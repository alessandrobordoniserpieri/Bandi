import { createAdminClient } from "@/lib/supabase/admin";
import { mapGrantRow, type GrantRowWithProvider } from "@/lib/grants/mapping";
import type { ProfileRow } from "@/lib/profile/schema";
import { runDigestBatch } from "@/lib/alerts/run-batch";
import { getSender } from "@/lib/alerts/send";
import { isAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GRANT_SELECT = "*, provider:grant_providers(name, kind)";
const WEEK_MS = 7 * 86_400_000;

// Weekly digest (Monday 07:00 via vercel.json). CRON_SECRET-protected. Iterates the users who
// opted into weekly alerts; per-user failures are recorded inside runDigestBatch, not fatal.
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bandi-scanner.vercel.app";

  try {
    const result = await runDigestBatch({
      appUrl,
      sender: getSender(process.env),
      async listRecipients() {
        const { data } = await admin
          .from("user_settings").select("user_id, alert_threshold").eq("alert_frequency", "weekly");
        return (data ?? []).map((r) => ({ userId: r.user_id, threshold: r.alert_threshold }));
      },
      async getProfileRow(userId) {
        const { data } = await admin.from("profiles").select("*").eq("user_id", userId).maybeSingle();
        return (data as ProfileRow | null) ?? null;
      },
      async getEmail(userId) {
        const { data } = await admin.auth.admin.getUserById(userId);
        return data.user?.email ?? null;
      },
      async getNewGrantViews() {
        const since = new Date(Date.now() - WEEK_MS).toISOString();
        const { data } = await admin.from("grants").select(GRANT_SELECT).gte("discovered_at", since);
        return ((data as unknown as GrantRowWithProvider[]) ?? []).map(mapGrantRow);
      },
    });
    console.log("[cron/digest]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/digest] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
