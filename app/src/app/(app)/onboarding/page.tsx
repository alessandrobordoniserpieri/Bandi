import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "../../(auth)/actions";
import { OnboardingWizard } from "./wizard";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (profile) redirect("/");

  return (
    <main>
      <div className="onboarding-shell">
        <div className="page-header" style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1>Completa il profilo</h1>
          <p>Bastano 3 passi e pochi campi essenziali per iniziare a ricevere i tuoi bandi.</p>
        </div>
        <OnboardingWizard />
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <form action={deleteAccount}>
            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
              Elimina account
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
