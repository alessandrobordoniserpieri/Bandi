import { runProductionScrape } from "bandi-scraper";
import { isAuthorized } from "../auth";

// Node runtime: the scraper uses fetch + the Supabase service-role client, not the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scraping 12 sources through an LLM exceeds the default 60s; raise the cap (Vercel Pro/Fluid).
export const maxDuration = 300;

// Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET so only the scheduler
// (or an authorized manual call) can start a run.
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await runProductionScrape(process.env);
    const totals = results.reduce(
      (acc, r) => ({
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { inserted: 0, updated: 0, skipped: 0, errors: 0 },
    );
    console.log("[cron/scrape]", JSON.stringify({ totals, results }));
    return Response.json({ ok: true, totals, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/scrape] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
