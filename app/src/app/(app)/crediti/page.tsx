import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Stub for the "Crediti & piano" page (DEC-6). Balance, transaction history and
// top-up land with the credits backend in phase F1; this placeholder only
// claims the route the sidebar widget links to.
export default async function CreditiPage() {
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
        <h1>Crediti &amp; piano</h1>
        <p>Il tuo saldo crediti, lo storico dei consumi e la ricarica.</p>
      </div>
      <div className="empty-state">
        <p>Questa pagina arriva a breve.</p>
        <p>Qui vedrai il saldo, come vengono spesi i crediti e potrai ricaricarli.</p>
      </div>
    </main>
  );
}
