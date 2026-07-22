// app/src/lib/ai/entitlement.ts
// Single entitlement seam for the "strong AI analysis" feature. Generalizes the pattern of
// rate-limit.ts behind ONE function so callers (routes) never change when the implementation does.
// V2-B: chat_message now consults the credit ledger (credits.ts) instead of an hourly bucket —
// "0 crediti = stop" (spec V2 Parte B). quick_analysis and extraction are unaffected: still
// independent rate-limit buckets, same as V1 (spec §8).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeCredit } from "./credits";

export type EntitlementAction = "quick_analysis" | "chat_message" | "extraction";
type RateLimitedAction = Exclude<EntitlementAction, "chat_message">;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Starting values (spec §8) — easily configurable. countCol/windowCol map each bucket to its
// user_settings columns; quick_analysis reuses the existing ai_calls_* columns unchanged.
export const LIMITS: Record<RateLimitedAction, { max: number; windowMs: number; countCol: string; windowCol: string }> = {
  quick_analysis: { max: 10, windowMs: HOUR, countCol: "ai_calls_count",     windowCol: "ai_calls_window_start" },
  extraction:     { max: 15, windowMs: DAY,  countCol: "extraction_count",   windowCol: "extraction_window_start" },
};

export async function checkEntitlement(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: EntitlementAction,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  if (action === "chat_message") {
    // Writes go through the admin client — user_credits only grants the user's own client SELECT
    // (migration 0017), by design: a user-scoped client must never increment its own balance.
    return consumeCredit(createAdminClient(), userId, "chat_message", now);
  }

  const { max, windowMs, countCol, windowCol } = LIMITS[action];
  const { data } = await supabase
    .from("user_settings")
    .select(`${countCol}, ${windowCol}`)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    const { error } = await supabase.from("user_settings").insert({
      user_id: userId, [countCol]: 1, [windowCol]: now.toISOString(),
    } as never);
    return { allowed: !error };
  }

  const row = data as unknown as Record<string, unknown>;
  const count = typeof row[countCol] === "number" ? (row[countCol] as number) : 0;
  const windowStart = typeof row[windowCol] === "string" ? Date.parse(row[windowCol] as string) : 0;
  const expired = now.getTime() - windowStart >= windowMs;

  if (!expired && count >= max) return { allowed: false };

  const { error } = await supabase
    .from("user_settings")
    .update((expired
      ? { [countCol]: 1, [windowCol]: now.toISOString() }
      : { [countCol]: count + 1 }) as never)
    .eq("user_id", userId);
  return { allowed: !error };
}
