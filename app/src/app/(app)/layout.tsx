import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

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
        {isOnboarded && (
          <div className="app-tabs">
            <Link href="/">Dashboard</Link>
            <Link href="/nuovi-bandi">Nuovi bandi</Link>
            <Link href="/i-miei-bandi">I miei bandi</Link>
            <Link href="/profilo">Profilo</Link>
          </div>
        )}
        <form action={signOut} className="app-logout"><button type="submit">Esci</button></form>
      </nav>
      {children}
    </div>
  );
}
