import { createClient } from "@/lib/supabase/server";
import { mapGrantRow, type GrantRowWithProvider, type GrantView } from "./mapping";

const SELECT = "*, provider:grant_providers(name, kind)";

export async function getGrants(opts?: { discoveredAfterDays?: number }): Promise<GrantView[]> {
  const supabase = await createClient();
  let query = supabase
    .from("grants")
    .select(SELECT)
    .order("deadline", { ascending: true, nullsFirst: false });
  if (opts?.discoveredAfterDays != null) {
    const since = new Date(Date.now() - opts.discoveredAfterDays * 86_400_000).toISOString();
    query = query.gte("discovered_at", since);
  }
  const { data, error } = await query;
  if (error) {
    console.error("getGrants failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as unknown as GrantRowWithProvider[]).map(mapGrantRow);
}

export async function getGrant(id: string): Promise<GrantView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getGrant failed:", error.message);
    return null;
  }
  if (!data) return null;
  return mapGrantRow(data as unknown as GrantRowWithProvider);
}
