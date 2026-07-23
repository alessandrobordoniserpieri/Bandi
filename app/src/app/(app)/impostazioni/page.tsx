import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Stub for "Impostazioni". Account settings land in a later phase; this
// placeholder only claims the route and sidebar entry.
export default async function ImpostazioniPage() {
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
        <h1>Impostazioni</h1>
        <p>Le impostazioni del tuo account.</p>
      </div>
      <div className="empty-state">
        <p>Questa sezione arriva a breve.</p>
      </div>
    </main>
  );
}
