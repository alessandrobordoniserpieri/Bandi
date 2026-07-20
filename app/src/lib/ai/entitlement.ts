// app/src/lib/ai/entitlement.ts
// Single entitlement seam for the "strong AI analysis" feature. Three INDEPENDENT rate-limit
// buckets (quick analysis, chat, extraction) behind ONE function, generalizing the pattern of
// rate-limit.ts. V2 (crediti) will swap the body to consult a credit balance — same signature,
// callers (routes) never change. Spec §8.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type EntitlementAction = "quick_analysis" | "chat_message" | "extraction";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Starting values (spec §8) — easily configurable. countCol/windowCol map each bucket to its
// user_settings columns; quick_analysis reuses the existing ai_calls_* columns unchanged.
export const LIMITS: Record<EntitlementAction, { max: number; windowMs: number; countCol: string; windowCol: string }> = {
  quick_analysis: { max: 10, windowMs: HOUR, countCol: "ai_calls_count",     windowCol: "ai_calls_window_start" },
  chat_message:   { max: 30, windowMs: HOUR, countCol: "chat_calls_count",   windowCol: "chat_calls_window_start" },
  extraction:     { max: 15, windowMs: DAY,  countCol: "extraction_count",   windowCol: "extraction_window_start" },
};

export async function checkEntitlement(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: EntitlementAction,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
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
