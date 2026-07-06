// app/src/lib/saved-grants/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canTransition, type SavedGrantStatus } from "./status";

export type SavedGrantActionResult = { ok: true } | { error: string };

// Add a grant to the user's list (idempotent: a second save of the same grant is a no-op,
// backed by the unique(user_id, grant_id) constraint — never resets an existing status).
export async function saveGrant(grantId: string): Promise<SavedGrantActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("saved_grants")
    .upsert({ user_id: user.id, grant_id: grantId }, { onConflict: "user_id,grant_id", ignoreDuplicates: true });
  if (error) return { error: "Impossibile salvare il bando." };

  revalidatePath("/i-miei-bandi");
  revalidatePath(`/bandi/${grantId}`);
  return { ok: true };
}

export async function removeSavedGrant(grantId: string): Promise<SavedGrantActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("saved_grants")
    .delete()
    .eq("user_id", user.id)
    .eq("grant_id", grantId);
  if (error) return { error: "Impossibile rimuovere il bando." };

  revalidatePath("/i-miei-bandi");
  revalidatePath(`/bandi/${grantId}`);
  return { ok: true };
}

// Move a card through the pipeline. The transition is re-validated server-side; the atomic
// track-record side effect on 'finanziato' lives in the set_saved_grant_status RPC (I6).
export async function updateStatus(
  savedGrantId: string,
  status: SavedGrantStatus,
): Promise<SavedGrantActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("saved_grants")
    .select("status")
    .eq("id", savedGrantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!current) return { error: "Bando non trovato." };
  if (current.status !== status && !canTransition(current.status, status)) {
    return { error: "Transizione di stato non valida." };
  }

  const { error } = await supabase.rpc("set_saved_grant_status", {
    p_saved_grant_id: savedGrantId,
    p_status: status,
  });
  if (error) return { error: "Aggiornamento non riuscito." };

  revalidatePath("/i-miei-bandi");
  revalidatePath("/profilo"); // §7 may have gained a track-record row
  return { ok: true };
}

export async function updateNotes(
  savedGrantId: string,
  notes: string,
): Promise<SavedGrantActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("saved_grants")
    .update({ notes: notes.trim() === "" ? null : notes })
    .eq("id", savedGrantId)
    .eq("user_id", user.id);
  if (error) return { error: "Impossibile salvare le note." };

  revalidatePath("/i-miei-bandi");
  return { ok: true };
}
