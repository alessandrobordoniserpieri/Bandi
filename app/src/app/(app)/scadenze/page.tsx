import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Stub for the "Scadenze" agenda view (DEC-13). Full list-by-urgency lands in
// phase F3; this placeholder only claims the route and sidebar entry.
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

  return (
    <main>
      <div className="page-header">
        <h1>Scadenze</h1>
        <p>Le scadenze dei bandi salvati e delle candidature in corso, ordinate per urgenza.</p>
      </div>
      <div className="empty-state">
        <p>Questa vista arriva a breve.</p>
        <p>Qui troverai i tuoi bandi raggruppati per urgenza: questa settimana, questo mese e oltre.</p>
      </div>
    </main>
  );
}
