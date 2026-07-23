import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { Sidebar } from "./sidebar";

// Placeholder balance for the pinned credits widget (DEC-6). The real balance
// arrives with the credits backend in F1; keep it a single named constant.
const PLACEHOLDER_CREDITS = 12;

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

  return (
    <div className="app-shell">
      <Sidebar
        showNav={isOnboarded}
        credits={PLACEHOLDER_CREDITS}
        signOutAction={signOut}
      />
      <div className="app-content">{children}</div>
    </div>
  );
}
