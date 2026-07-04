// app/src/app/(app)/onboarding/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "../../(auth)/actions";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (profile) redirect("/");

  return (
    <main>
      <h1>Completa il profilo</h1>
      <p>Bastano 3 passi e pochi campi essenziali per iniziare a ricevere i tuoi bandi.</p>
      <OnboardingWizard />
      <form action={deleteAccount}>
        <button type="submit">Elimina account</button>
      </form>
    </main>
  );
}
