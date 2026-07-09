import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { profileCompletion } from "@/lib/profile/completion";
import { getGrants } from "@/lib/grants/queries";
import { buildMatchedGrants } from "@/lib/grants/match-list";
import { applyFilters, applySort, parseFilters } from "@/lib/grants/filters";
import { GrantCard } from "@/components/grants/grant-card";
import { FilterBar } from "@/components/grants/filter-bar";
import { EmptyState } from "@/components/grants/empty-state";

export default async function NuoviBandiPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");
  const row = profile as ProfileRow;

  const views = await getGrants({ discoveredAfterDays: 7 });
  const open = buildMatchedGrants(rowToEntityProfile(row), views)
    .filter((m) => m.match.verdict !== "Storico");

  const { filters, sort } = parseFilters(await searchParams);
  const shown = applySort(applyFilters(open, filters), sort);
  const percent = profileCompletion(row).percent;

  return (
    <main>
      <div className="page-header">
        <h1>Nuovi bandi</h1>
        <p>Bandi scoperti negli ultimi 7 giorni.</p>
      </div>
      <FilterBar filters={filters} sort={sort} />
      {shown.length === 0
        ? <EmptyState profileComplete={percent >= 100} />
        : shown.map((m) => <GrantCard key={m.grant.id} matched={m} />)}
    </main>
  );
}
