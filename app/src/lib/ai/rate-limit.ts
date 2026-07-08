// app/src/lib/ai/rate-limit.ts
// Simple per-user hourly quota for AI analysis, persisted in user_settings (owner RLS applies
// because the caller passes the user's own client). Races between concurrent calls can at
// worst grant one extra call — acceptable for an MVP limit.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const AI_CALLS_PER_HOUR = 10;
const WINDOW_MS = 60 * 60 * 1000;

export async function consumeAnalysisQuota(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const { data } = await supabase
    .from("user_settings")
    .select("ai_calls_count, ai_calls_window_start")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    const { error } = await supabase.from("user_settings").insert({
      user_id: userId, ai_calls_count: 1, ai_calls_window_start: now.toISOString(),
    });
    return { allowed: !error };
  }

  const windowStart = data.ai_calls_window_start ? Date.parse(data.ai_calls_window_start) : 0;
  const expired = now.getTime() - windowStart >= WINDOW_MS;

  if (!expired && data.ai_calls_count >= AI_CALLS_PER_HOUR) return { allowed: false };

  const { error } = await supabase
    .from("user_settings")
    .update(
      expired
        ? { ai_calls_count: 1, ai_calls_window_start: now.toISOString() }
        : { ai_calls_count: data.ai_calls_count + 1 },
    )
    .eq("user_id", userId);
  return { allowed: !error };
}
