// app/src/lib/settings/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AlertFrequency = "weekly" | "off";
export type SettingsActionResult = { ok: true } | { error: string };

// Save the user's digest preferences (score threshold + frequency) into user_settings.
export async function updateAlertSettings(
  threshold: number,
  frequency: AlertFrequency,
): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(threshold) ? threshold : 50)));
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, alert_threshold: clamped, alert_frequency: frequency },
      { onConflict: "user_id" },
    );
  if (error) return { error: "Impossibile salvare le preferenze." };

  revalidatePath("/profilo");
  return { ok: true };
}
