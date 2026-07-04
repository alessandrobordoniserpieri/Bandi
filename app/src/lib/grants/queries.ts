import { createClient } from "@/lib/supabase/server";
import { mapGrantRow, type GrantRowWithProvider, type GrantView } from "./mapping";

const SELECT = "*, provider:grant_providers(name, kind)";

export async function getGrants(): Promise<GrantView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants")
    .select(SELECT)
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error || !data) return [];
  return (data as unknown as GrantRowWithProvider[]).map(mapGrantRow);
}

export async function getGrant(id: string): Promise<GrantView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapGrantRow(data as unknown as GrantRowWithProvider);
}
