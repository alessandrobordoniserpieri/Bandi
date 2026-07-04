// app/src/app/(app)/bandi/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrants } from "@/lib/grants/queries";
import { buildMatchedGrants } from "@/lib/grants/match-list";
import { GrantCard } from "@/components/grants/grant-card";

export default async function BandiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  const views = await getGrants();
  const matched = buildMatchedGrants(rowToEntityProfile(profile as ProfileRow), views);

  return (
    <main>
      <h1>Bandi</h1>
      {matched.length === 0
        ? <p>Nessun bando disponibile al momento.</p>
        : matched.map((m) => <GrantCard key={m.grant.id} matched={m} />)}
    </main>
  );
}
