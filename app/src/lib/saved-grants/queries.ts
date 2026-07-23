import { createClient } from "@/lib/supabase/server";
import { mapGrantRow, type GrantRowWithProvider } from "@/lib/grants/mapping";
import { calculateMatch, deadlineIndicator, type Grant, type Verdict, type DeadlineIndicator } from "@/lib/matching";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import type { SavedGrantStatus } from "./status";

export interface SavedGrantView {
  savedGrantId: string;
  status: SavedGrantStatus;
  notes: string | null;
  grant: Grant;
  providerName: string | null;
  // DEC-2: the matching info follows the grant into the Kanban. Verdict needs the entity profile
  // (null when it isn't set up yet); the deadline is derived from the grant alone.
  verdict: Verdict | null;
  deadline: DeadlineIndicator;
}

// All of the current user's saved grants with their grant + provider, newest activity first.
export async function getSavedGrants(): Promise<SavedGrantView[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Load the profile once so every card can show its verdict (DEC-2). Absent profile → verdict null.
  const { data: profileRow } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile = profileRow ? rowToEntityProfile(profileRow as ProfileRow) : null;

  const { data } = await supabase
    .from("saved_grants")
    .select("id, status, notes, grant:grants(*, provider:grant_providers(name, kind))")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (data ?? [])
    .filter((row) => row.grant)
    .map((row) => {
      const { grant, providerName } = mapGrantRow(row.grant as unknown as GrantRowWithProvider);
      const match = profile ? calculateMatch(profile, grant) : null;
      return {
        savedGrantId: row.id,
        status: row.status,
        notes: row.notes,
        grant,
        providerName,
        verdict: match?.verdict ?? null,
        deadline: match ? match.indicators.deadline : deadlineIndicator(grant),
      };
    });
}

// The current user's saved-grant record for a given grant, if any (for the detail Save button).
export async function getSavedGrantByGrantId(
  grantId: string,
): Promise<{ id: string; status: SavedGrantStatus } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("saved_grants")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("grant_id", grantId)
    .maybeSingle();

  return data ? { id: data.id, status: data.status } : null;
}
