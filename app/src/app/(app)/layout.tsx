import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { NavTabs } from "./nav-tabs";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // No profile yet and not already on onboarding → send to onboarding.
  // (The onboarding route renders without this shell redirect loop because it
  //  lives here too; guard by allowing the onboarding page to render children.)
  const isOnboarded = Boolean(profile);

  return (
    <div>
      <nav className="app-nav">
        <strong className="app-brand">BANDI-SCANNER</strong>
        {isOnboarded && <NavTabs />}
        <form action={signOut} className="app-logout">
          <Button type="submit" variant="ghost" size="sm">Esci</Button>
        </form>
      </nav>
      {children}
    </div>
  );
}
