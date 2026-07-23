import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/ai/credits";
import { signOut } from "../(auth)/actions";
import { Sidebar } from "./sidebar";

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

  // No profile yet → the user is still onboarding; hide the full navigation
  // (the onboarding route renders inside this shell) but keep brand + logout.
  const isOnboarded = Boolean(profile);

  // The sidebar widget only renders once onboarded (see below), so skip the
  // extra read otherwise — a fresh user_credits row does not exist yet.
  const credits = isOnboarded ? await getCreditBalance(supabase, user.id) : null;

  return (
    <div className="app-shell">
      <Sidebar
        showNav={isOnboarded}
        credits={credits?.total ?? 0}
        signOutAction={signOut}
      />
      <div className="app-content">{children}</div>
    </div>
  );
}
