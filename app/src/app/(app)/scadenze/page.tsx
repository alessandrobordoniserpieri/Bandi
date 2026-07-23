import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSavedGrants } from "@/lib/saved-grants/queries";
import { groupByUrgency } from "@/lib/scadenze/group";
import { UrgencyGroupSection } from "@/components/scadenze/urgency-group-section";
import { EmptyState } from "@/components/ui/empty-state";

// The Scadenze agenda (DEC-13, concept §5.10): saved grants + candidature in
// corso, sorted by deadline ascending and grouped by urgency. No calendar —
// with few deadlines/month a grid reads half-empty and is less actionable
// than a flat, groupable list. Doubles as the in-app events dashboard.
export default async function ScadenzePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const items = await getSavedGrants();
  const groups = groupByUrgency(items);

  return (
    <main>
      <div className="page-header">
        <h1>Scadenze</h1>
        <p>Le scadenze dei bandi salvati e delle candidature in corso, ordinate per urgenza.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={24} aria-hidden="true" />}
          title="Nessuna scadenza da monitorare"
          description="Salva un bando che ti interessa: qui troverai le sue scadenze raggruppate per urgenza — questa settimana, questo mese e oltre."
          action={{ label: "Esplora bandi", href: "/" }}
        />
      ) : (
        <div className="agenda">
          {groups.map((group) => (
            <UrgencyGroupSection key={group.bucket} group={group} />
          ))}
        </div>
      )}
    </main>
  );
}
